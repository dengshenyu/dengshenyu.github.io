---
layout: post
title: "Spring与WebSocket"
keywords: "Java,Spring,WebSocket"
description: "Spring与WebSocket"
date: 2016-05-24 18:00
categories: "后端技术"
---

## WebSocket介绍

WebSocket协议[RFC 6455](https://tools.ietf.org/html/rfc6455)为Web应用定义了一种新的通信方式：client与server间全双工，双向的通信。在漫长的技术发展史上，我们为了使web的交互性更好使用了Java Applets，XMLHttpRequest，Adobe Flash，ActiveXObject，Comet等技术，但是WebSocket的出现是一种新的令人激动的可能性。

本文不讨论WebSocket的协议，但是我们得知道一个前提：WebSocket开始有个handshake，而这个handshake是使用HTTP完成的。准确的说，这个handshake依赖于HTTP中的[协议升级机制](https://developer.mozilla.org/en-US/docs/Web/HTTP/Protocol_upgrade_mechanism)，当服务器收到这个协议升级请求后如果接受则返回HTTP状态码101。handshake成功后，HTTP协议升级请求所使用的TCP连接会保持open状态，然后client与server会使用它来相互发送消息。

可以看下这个关于WebSocket的[知乎回答](https://www.zhihu.com/question/20215561)。

## WebSocket子协议

目前的Web应用广泛采用了REST架构，即基于URL以及HTTP方法（GET、PUT、POST、DELETE）。但WebSocket应用有所不同，它只使用一个URL来建立最初的HTTP handshake，一旦握手成功后所有的消息通信都直接基于底层的TCP连接。这种异步的、事件驱动的消息通信架构和REST完全不同。

WebSocket的确有这么一个**消息通信架构**，但是并不限制具体的消息通信协议。WebSocket只是TCP上面很轻的一层，它只是将TCP的字节流转换成消息流（文本或二进制），仅此而已。对于怎么解析消息流的内容，完全依赖于应用本身。

如果一个framework或者container使用了WebSocket，在WebSocket协议中是没有足够的信息指明到来的消息应该怎么被路由或者处理。因此WebSocket对于简单应用还好，但对于其他复杂点的的确太底层了，即便可以使用，但需要我们自顶向下定义一个框架。

基于这个原因，WebSocket RFC定义了[子协议](https://tools.ietf.org/html/rfc6455#section-1.9)。在handshake的过程中，client与server可以使用**Sec-WebSocket-Protocol**来协商一个子协议。子协议不是必须使用的，但即便不使用，应用仍然需要定义一个client与server能够通信的消息格式。这个格式可以是自定义的，或者是基于具体框架的，又或者是一个标准的消息通信协议。

Spring框架提供了[STOMP](http://stomp.github.io/stomp-specification-1.2.html#Abstract)的支持，这是一个简单的消息通信协议，最初只是在脚本语言中使用，但今天已经被广泛支持而且非常适合在WebSocket中使用。

## <a name="spring-stomp"></a>Spring与STOMP

本文不讨论STOMP的具体协议，但对于STOMP的三种消息需要了解：

1. SEND：client向server发送消息
2. SUBSCRIBE：client向server订阅某种类型的消息
3. MESSAGE：server向client分发消息

Spring的spring-messaging模块支持STOMP协议，同时还包含了很多消息处理的关键抽象，下面是一个简单的消息处理示意图：

![message-flow](/assets/websocket/message-flow.png)

* Message：消息，带有header和payload。
* MessageHandler：处理client消息的抽象。
* MessageChannel：解耦消息发送者与消息接收者的抽象。举个例子，client可以发送消息到channel，而不用管这条消息最终被谁处理。
* Broker：存放消息的中间件。


## 浏览器兼容性问题及解决方案

但是WebSocket在实践上仍然很有挑战，原因在于相当一部分浏览器不支持WebSocket协议。IE浏览器支持WebSocket的版本是IE10。。。另外，一些受限的代理也可能会禁止HTTP的协议升级或者强制断开连接时间过长的TCP。

因此，在建立一个WebSocket应用的时候，我们会对于支持WebSocket的浏览器使用WebSocket来通信；对于不支持WebSocket的浏览器，我们仍然希望使用类似于WebSocket的API，这样我们的程序完全不用变，而底层的通信则使用其他的方式来实现。

[SocketJS](https://github.com/sockjs/sockjs-protocol)是一个解决方案，它包含了client端及server端完整的实现，它所提供的跨浏览器并且保持一致的API使得我们能够在快速开发的同时具有很好的浏览器兼容性。

## <a name="code"></a>Talk is cheap, show Me the code

我们来动手写个小demo吧。在写demo之前，需要准备下环境：

* JDK 1.8+
* Maven 3.0+

首先，创建根目录**messaging-stomp-websocket**。

然后创建pom.xml：

{% highlight xml %}

<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>org.springframework</groupId>
    <artifactId>gs-messaging-stomp-websocket</artifactId>
    <version>0.1.0</version>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>1.3.5.RELEASE</version>
    </parent>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-websocket</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-messaging</artifactId>
        </dependency>
    </dependencies>

    <properties>
        <java.version>1.8</java.version>
    </properties>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>

</project>

{% endhighlight %}

现在我们来写server端的代码，首先使用**mkdir -p src/main/java/hello**来建立层级目录。

在这个demo中，client与server通信的消息体使用JSON格式，client向server发送包含名字的消息：

{% highlight json %}

{
    "name": "Dengshenyu"
}

{% endhighlight %}

sever收到消息后，返回欢迎的消息：

{% highlight json %}

{
    "content": "Hello, Dengshenyu!"
}

{% endhighlight %}

我们分别用两个POJO（Plain Old Java Object）来表示：

**src/main/java/hello/HelloMessage.java**：

{% highlight java %}

package hello;

public class HelloMessage {

    private String name;

    public String getName() {
        return name;
    }

}

{% endhighlight %}

**src/main/java/hello/Greeting.java**：

{% highlight java %}

package hello;

public class Greeting {

    private String content;

    public Greeting(String content) {
        this.content = content;
    }

    public String getContent() {
        return content;
    }

}

{% endhighlight %}


我们创建一个消息处理的controller，这个controller用来处理client发送到“/hello”的STOMP消息。

**src/main/java/hello/GreetingController.java**：

{% highlight java %}

package hello;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

@Controller
public class GreetingController {


    @MessageMapping("/hello")
    @SendTo("/topic/greetings")
    public Greeting greeting(HelloMessage message) throws Exception {
        Thread.sleep(3000); // simulated delay
        return new Greeting("Hello, " + message.getName() + "!");
    }

}

{% endhighlight %}

* @MessageMapping表明一个消息被发送到“/hello”时，这个方法会被调用处理该消息。
* @SendTo表明greeting方法处理完后，会发送一个Greeting的消息到“/topic/greetings”这个broker。

最后创建Spring配置来使用WebSocket以及STOMP消息通信。

**src/main/java/hello/WebSocketConfig.java**：

{% highlight java %}

package hello;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.AbstractWebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig extends AbstractWebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/hello").withSockJS();
    }

}

{% endhighlight %}

* @Configuration表明这是一个Spring的配置类。
* @EnableWebSocketMessageBroker表明启用WebSocket消息中间件，以及WebSocket消息处理。
* configureMessageBroker()方法用来配置消息中间件，它通过调用enableSimpleBroker()来使用一个基于内存的消息中间件，这个中间件放置所有需要返回给client的以“/topic”为前缀的消息。同时它为@MessageMapping标记的方法所绑定的消息设置了一个“/app”的消息前缀。
* registerStompEndpoints()方法注册了一个“/hello”的endpoint，同时使用了SockJS。client端建立WebSocket连接的时候是基于endpoint的。


下面我们写一个简易的client。

首先，使用**mkdir -p src/main/resources/static/**来建立层级目录。

然后，由于我们需要用到SockJS以及STOMP，因此我们需要下载[sockjs-0.3.4.js](http://cdn.sockjs.org/sockjs-0.3.4.js)以及[stomp.js](https://raw.githubusercontent.com/jmesnil/stomp-websocket/master/lib/stomp.js)，并放在src/main/resources/static/目录下。

最后，我们写一个简单的html页面：

**src/main/resources/static/index.html**：

{% highlight html %}

<!DOCTYPE html>
<html>
<head>
    <title>Hello WebSocket</title>
    <script src="sockjs-0.3.4.js"></script>
    <script src="stomp.js"></script>
    <script type="text/javascript">
        var stompClient = null;

        function setConnected(connected) {
            document.getElementById('connect').disabled = connected;
            document.getElementById('disconnect').disabled = !connected;
            document.getElementById('conversationDiv').style.visibility = connected ? 'visible' : 'hidden';
            document.getElementById('response').innerHTML = '';
        }

        function connect() {
            var socket = new SockJS('/hello');
            stompClient = Stomp.over(socket);
            stompClient.connect({}, function(frame) {
                setConnected(true);
                console.log('Connected: ' + frame);
                stompClient.subscribe('/topic/greetings', function(greeting){
                    showGreeting(JSON.parse(greeting.body).content);
                });
            });
        }

        function disconnect() {
            if (stompClient != null) {
                stompClient.disconnect();
            }
            setConnected(false);
            console.log("Disconnected");
        }

        function sendName() {
            var name = document.getElementById('name').value;
            stompClient.send("/app/hello", {}, JSON.stringify({ 'name': name }));
        }

        function showGreeting(message) {
            var response = document.getElementById('response');
            var p = document.createElement('p');
            p.style.wordWrap = 'break-word';
            p.appendChild(document.createTextNode(message));
            response.appendChild(p);
        }
    </script>
</head>
<body onload="disconnect()">
<noscript><h2 style="color: #ff0000">Seems your browser doesn't support Javascript! Websocket relies on Javascript being enabled. Please enable
    Javascript and reload this page!</h2></noscript>
<div>
    <div>
        <button id="connect" onclick="connect();">Connect</button>
        <button id="disconnect" disabled="disabled" onclick="disconnect();">Disconnect</button>
    </div>
    <div id="conversationDiv">
        <label>What is your name?</label><input type="text" id="name" />
        <button id="sendName" onclick="sendName();">Send</button>
        <p id="response"></p>
    </div>
</div>
</body>
</html>

{% endhighlight %}

* 这个页面关键的JS代码在于connect()方法和sendName()方法，connect()方法建立WebSocket连接，成功之后向server端订阅“/topic/greetings”的消息。sendName()方法则向server端发送消息。
* 通过这个页面可以看到，Stomp是基于SockJS之上的，SocketJS向Stomp提供了WebSocket的API，但实际上会根据浏览器对WebSocket的支持程度来具体实现。


至此，我们代码已经基本写完了！我们来运行下吧！写一个运行类：

**src/main/java/hello/Application.java**：

{% highlight java %}

package hello;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}

{% endhighlight %}

进到根目录中，在命令行下输入**mvn spring-boot:run**。运行起来后在浏览器中访问http://localhost:8080。

![run](/assets/websocket/run.png)


## 总结

本文介绍了一些Spring与WebSocket的相关知识，主要参考了[Spring的WebSocket文档](http://docs.spring.io/spring/docs/current/spring-framework-reference/html/websocket.html)以及[Spring的WebSocket实践](https://spring.io/guides/gs/messaging-stomp-websocket/)。

原文描述的更加完整以及具体，感兴趣的同学可以继续阅读。


