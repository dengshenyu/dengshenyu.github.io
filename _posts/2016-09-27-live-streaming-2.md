---
layout: post
title: "直播技术实现(二)"
keywords: "直播,rtmp,nginx,live-streaming"
description: "动手实现直播"
date: 2016-09-05 17:00
categories: "后端技术"
---


前几天更新了[第一篇](http://nahai.me/%E5%90%8E%E7%AB%AF%E6%8A%80%E6%9C%AF/2016/09/05/live-streaming.html)关于直播视频上传及实时播放的技术文章，本篇目标为：实现视频上传权限验证。

在第一篇中，我们使用了OBS来向服务端发布直播。但我一直有一个疑问：如何实现权限验证呢？

经过一番调研，终于找到一个基于nginx+fastcgi+php的解决方案。

### 什么是fastcgi？

关于fastcgi的介绍大家可以自行Google，或者看下[这篇文章](https://www.zybuluo.com/phper/note/50231)。

对于nginx、fastcgi和php的关系，这里摘抄原文一句话作为总结：

> 简单的说，就是：cgi就是专门用来和web 服务器打交道的。web服务器收到用户请求，就会把请求提交给cgi程序（php的fastcgi），cgi程序根据请求提交的参数作应处理（解析php），然后输出标准的html语句返回给web服服务器，再返回给客户端，这就是普通cgi的工作原理。

### php和php-fpm

php-fpm是php专用的fastcgi管理器，我们现在安装php和php-fpm。

Mac的brew大法好：

{% highlight bash %}

brew install --without-apache --with-fpm --with-mysql php56

{% endhighlight %}

* --with-fpm：希望包含php-fpm模块；
* --with-mysql：由于以后可能会使用mysql，因此这里希望php也支持mysql访问。

安装完成后，如果希望mac开机启动php-fpm，执行命令：

{% highlight bash %}

mkdir -p ~/Library/LaunchAgents
cp /usr/local/opt/php56/homebrew.mxcl.php56.plist ~/Library/LaunchAgents/

{% endhighlight %}

现在启动php-fpm：

{% highlight bash %}

launchctl load -w ~/Library/LaunchAgents/homebrew.mxcl.php56.plist

{% endhighlight %}

执行下面命令看是否启动正常：

{% highlight bash %}

lsof -Pni4 | grep LISTEN | grep php

{% endhighlight %}

看到类似这样的输出的话意味着php-fpm启动正常：

![php-fpm](/assets/live-streaming-2/php-fpm.png)

### nginx配置以及php验证脚本

上一篇的nginx配置中包含了两大模块--rtmp和http。加上权限验证，修改成如下配置：

{% highlight nginx %}

worker_processes  1;

events {
    worker_connections  1024;
}
rtmp {
    server {
        listen 1935;
        chunk_size 4000;

        # HLS
        application hls {
            live on;
            hls on;
            hls_path /Users/shenyuan/workspace/live-streaming/hls;

            on_publish http://127.0.0.1:8080/auth.php;
            notify_method get;
        }
    }
}

# HTTP can be used for accessing RTMP stats

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
        location ~ \.php$ {
            root html;
            fastcgi_pass 127.0.0.1:9000;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME /Users/shenyuan/workspace/live-streaming/php/$fastcgi_script_name;
            include fastcgi_params;
        }
    }
}

{% endhighlight %}

其中，

* rtmp中的hls应用增加的notify_method和on_publish表明，接收到rtmp视频流数据时先请求auth.php获取验证结果；
* http中的增加了以.php为后缀的location，将该请求转发到fastcgi。fastcgi执行脚本/Users/shenyuan/workspace/live-streaming/php/auth.php来得到验证结果。

auth.php非常简单，如下所示：

{% highlight php %}

<?php
if(empty($_GET['user']) || empty($_GET['pass'])) {
    //no querystrings or wrong syntax
    echo "wrong query input";
    header('HTTP/1.0 404 Not Found');
    exit(1);
} else {
    //querystring exist
    $username = $_GET['user'];
    $password = $_GET['pass'];
}

$saveduser = 'jack' ;
$savedpassword = '12345' ;

//check pass and user string
if (strcmp($password,$savedpassword)==0 &&  strcmp($username,$saveduser)==0 ) {
    echo "Password and Username OK! ";
} else {
    echo "password or username wrong! ";
    header('HTTP/1.0 404 Not Found'); //kein stream
}

?>

{% endhighlight %}

至此，服务端搭建完毕。重启nginx以加载新配置。

### OBS客户端

此时如果保持和第一篇的配置，那么由于服务端增加了权限验证，那么在开始串流的时候会报错：

![obs-fail](/assets/live-streaming-2/obs-fail.png)

我们只需要在串流配置中增加user=jack和pass=12345的验证信息即可：

![obs-fail](/assets/live-streaming-2/obs-config.png)


### 改进

做完后回顾了一下，觉得rtmp的on_publish是在视频流上传时做一个身份验证，因此不一定要用fastcgi来做。以后有时间探索使用Java实现。

### 参考资料

[nginx-rtmp-secure-your-nginx-server](https://helping-squad.com/nginx-rtmp-secure-your-nginx-server/)

