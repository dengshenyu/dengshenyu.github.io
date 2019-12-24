---
layout: post
title: Java中如何使用代理
---

由于工作的关系，接触到了Java中使用代理的方式。这里稍微做下整理。

首先，为什么需要使用代理？的确，在常见的项目中，如果需要访问资源（如HTTP、FTP等）就直接访问了；但有些项目可能会运行在一个受限的环境，它与目标资源存在环境隔离，而需要访问资源的时候需要通过一个特定的代理来进行。最简单的代理方式就是Nginx代理，当然还有其他的代理方式，如Socks代理。

由[此文档](https://docs.oracle.com/javase/7/docs/technotes/guides/net/proxies.html)可知，Java中支持四种代理，分别是：
* HTTP代理
* HTTPS代理
* FTP代理
* SOCKS代理

就拿HTTP代理来说，我们可以通过如下两种方式来设置HTTP代理：
* 在启动JVM的时候传递-D参数；
* 通过System.setProperty(String, String)方法来设置代理

下面来动手试一下。首先，我们需要一个HTTP代理。在Mac下，可以使用[brew工具](https://brew.sh/)执行`brew install nginx`来安装一个nginx。安装完成后，默认的nginx配置文件路径为`/usr/local/etc/nginx/nginx.conf`，我们需要对其进行修改。

稍微解释下，在当前的场景下我们需要这个nginx作为本地Java进程的正向代理。假如Java进程中需要访问www.baidu.com ，那么Java进程会把该HTTP请求发给nginx，然后nginx再原封不动的把请求发出去。这个过程跟nginx作为反向代理不同的地方在于，反向代理收到请求后，是转给特定后端服务的，说白了就是nginx转发的host部分跟原始请求的host是不同的。

编辑`/usr/local/etc/nginx/nginx.conf`配置中的监听8080的server部分，修改为：

```
    server {
        listen       8080;
        resolver 8.8.8.8;

        location / {
            proxy_pass http://$host$request_uri;
        }

        error_page   500 502 503 504  /50x.html;
        location = /50x.html {
            root   html;
        }
    }
```
相比默认配置，主要修改了两部分：
* resolver：用来解析$host，8.8.8.8为Google的主DNS服务器；
* proxy_pass：将请求转发到特定地址。上面配置中使用了$host和$request_uri变量，这两个变量为原始请求中的host和request_uri，这样就完成了一个简单的正向代理转发配置。

修改完配置后，直接在命令行下执行`nginx`命令运行nginx。

接下来，我们写一个简单的Java程序来使用这个nginx代理，代码如下：

```java
   public static void main(String[] args) {
        try {
            System.setProperty("http.proxyHost", "127.0.0.1");
            System.setProperty("http.proxyPort", "8080");

            URL url = new URL("http://www.baidu.com/");
            InputStream in = url.openStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(in));
            String line;
            while ((line = reader.readLine()) != null) {
                System.out.println(line);
            }
            reader.close();
        } catch (Exception ex) {
            ex.printStackTrace();
        }
    }
```
代码中使用了System.setProperty来设置HTTP代理。当访问http://www.baidu.com 这个地址时，请求会转发到127.0.0.1:8080，也就是我们上面启动的nginx上。然后nginx再访问http://www.baidu.com ，并将结果返回给Java进程。

本地运行结果如下：
![run](/assets/how-java-use-proxy/run.png)
