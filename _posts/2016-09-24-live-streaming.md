---
layout: post
title: "动手实现直播(一)"
keywords: "直播,rtmp,nginx,live-streaming"
description: "动手实现直播"
date: 2016-09-05 17:00
categories: "后端技术"
---

前不久我在[开发者头条](http://toutiao.io/)上看到陈老师发了一个关于直播的[技术文章](http://mp.weixin.qq.com/s?__biz=MjM5ODIzNDQ3Mw==&mid=2649966092&idx=1&sn=aaba8cc1f2b34860669f5fbfa814cf60&scene=0#wechat_redirect)，觉得很有意思，于是便打算自己实现一个。

虽然有前人探路并指明大致方向，但实现起来仍然遇到颇多困难。本着于己于人的原则，计划将整理一系列的技术笔记，希望对大家有些许帮助。

本篇笔记的目标为：1）实现直播的实时上传；2）使用浏览器观看直播。

## 框架与技术

整个直播框架主要分为三个角色：服务端，直播客户端，订阅者。它们之间的交互如下：

* 直播客户端向服务端上传直播视频流。通信协议采取RTMP（实时信息传输协议），客户端使用OBS（Open Broadcaster Software）开源直播软件，服务端使用nginx。
* 服务端nginx将收到的RTMP视频流转换成HLS（HTTP Live Streaming）文件，以便供观看客户端访问。
* 订阅者向服务端请求实时视频流。这里订阅者将使用JS来请求视频流（即HLS文件）。

下面我们来一步一步实现。

## 安装nginx与nginx-rtmp模块

首先，我们需要下载nginx源码。但是[Nginx Github](https://github.com/nginx/nginx)并不完整，于是自己从[nginx官方wiki](https://www.nginx.com/resources/wiki/start/topics/tutorials/install/)上找到一个[压缩包](http://nginx.org/download/nginx-1.10.1.tar.gz?_ga=1.32607294.1401439941.1473343606)并下载。

然后，下载nginx-rtmp模块源码。这个可以直接从[Github](https://github.com/arut/nginx-rtmp-module)上clone下来。

下载完nginx源码及nginx-rtmp源码后，我们需要在本地编译nginx，并将nginx-rtmp模块编译进nginx中。

按照nginx-rtmp-module github上文档，我们进入到nginx的源码目录，并执行这个操作：

{% highlight conf %}

./configure --add-module=/Users/shenyuan/workspace/nginx-rtmp-module

{% endhighlight %}

如果你们很顺利，那么恭喜你们...我在Mac上执行时出现了这个错误：

{% highlight conf %}

./configure: error: SSL modules require the OpenSSL library.
You can either do not enable the modules, or install the OpenSSL library
into the system, or build the OpenSSL library statically from the source
with nginx by using --with-openssl=<path> option.

{% endhighlight %}


很明显，没有openssl包，ok，我有brew大法：

{% highlight conf %}

brew install openssl

{% endhighlight %}

但安装完发现依然出现这个错误。经过漫长的debug与尝试，我在./configure的出错信息有如下几行：

{% highlight conf %}

checking for OpenSSL library ... not found
checking for OpenSSL library in /usr/local/ ... not found
checking for OpenSSL library in /usr/pkg/ ... not found
checking for OpenSSL library in /opt/local/ ... not found

{% endhighlight %}

而安装完openssl之后则有这几行提示：

{% highlight conf %}

Generally there are no consequences of this for you. If you build your
own software and it requires this formula, you'll need to add to your
build variables:

    LDFLAGS:  -L/usr/local/opt/openssl/lib
    CPPFLAGS: -I/usr/local/opt/openssl/include

{% endhighlight %}

由此看来，虽然我安装了ssl库，但是configure的时候找openssl的路径和安装路径并不一致。根据[nginx官方wiki](https://www.nginx.com/resources/wiki/start/topics/tutorials/installoptions/)，在configure的时候加上ssl的文件路径：

{% highlight conf %}

--with-ld-opt="-L /usr/local/lib" \
--with-cc-opt="-I /usr/local/include"

{% endhighlight %}

正确的./configure命令应该是这样的：

{% highlight conf %}

./configure --add-module=/Users/shenyuan/workspace/nginx-rtmp-module   --with-cc-opt="-I /usr/local/opt/openssl/include"  --with-ld-opt="-L /usr/local/opt/openssl/lib”

{% endhighlight %}

至此，configure终于成功了...

此后，make和install非常顺利。

## 配置nginx支持直播流上传

这一步，我们需要配置nginx支持rtmp流上传并转换成HLS视频文件。相关配置可以参考rtmp模块的[github文档](https://github.com/arut/nginx-rtmp-module)，这里贴下我的nginx rtmp配置：

{% highlight nginx %}

rtmp {
    server {
        listen 1935;
        chunk_size 4000;

        # HLS
        application hls {
            live on;
            hls on;
            hls_path /Users/shenyuan/workspace/live-streaming/hls;
        }
    }
}

{% endhighlight %}

很简单，nginx监听1935端口，并将视频流转换成HLS文件放置在/Users/shenyuan/workspace/live-streaming/hls目录下。

至此，rtmp流上传和HLS转换配置完成。稍后我会补充HLS访问的nginx配置，但我们可以先启动nginx，以便测试上传是否正常工作。

## 安装配置直播客户端OBS

[OBS](https://obsproject.com/)是一个开源的免费直播客户端，根据环境下载相应的客户端安装包。在主界面根据各自环境配置下“场景”和“来源”；而与rtmp流上传相关的配置则需要在“设置”界面中的“串流”配置串流类型、URL和流密钥：

![rtmp-config](/assets/live-streaming/rtmp-config.png)

在主界面点击“开始串流”，开始直播。在/Users/shenyuan/workspace/live-streaming/hls目录下可以看到实时上传并转换的HLS文件：

![hls-file](/assets/live-streaming/hls-file.png)

至此，上传流程正常。接下来，我们实现视频流播放。

## 使用JS观看直播

在观看直播前，我们需要配置nginx的http模块以支持HLS视频播放：

{% highlight nginx %}

http {
    server {
        listen  8080;

        location /hls {
            # Serve HLS fragments
            types {
                application/vnd.apple.mpegurl m3u8;
                video/mp2t ts;
            }
            root /Users/shenyuan/workspace/live-streaming;
            add_header Cache-Control no-cache;
        }

        location /www {
            root /Users/shenyuan/workspace/live-streaming;
        }
    }
}

{% endhighlight %}

这里的nginx配置可以分为两部分：

* hls: 提供HLS视频文件的访问，HLS视频文件为刚才上传转换而来的。
* www：直播页面。

直播页面只有一个视频播放界面，而视频加载的JS则参考这个[JS解决方案](https://github.com/dailymotion/hls.js)。

在/Users/shenyuan/workspace/live-streaming/www目录下新建live.html文件，内容如下：

{% highlight html %}

<script src="https://cdn.jsdelivr.net/hls.js/latest/hls.min.js"></script>
<video id="video"></video>
<script>
  if(Hls.isSupported()) {
    var video = document.getElementById('video');
    var hls = new Hls();
    hls.loadSource('http://127.0.0.1:8080/hls/test.m3u8');
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED,function() {
      video.play();
  });
 }
</script>

{% endhighlight %}

至此，订阅者相关的nginx配置与JS实现完成。

## 最后

重启nginx，并使用OBS开始直播。

在浏览器里输入http://127.0.0.1:8080/www/live.html，观看直播吧！




