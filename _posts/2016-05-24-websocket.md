---
layout: post
title: "Spring与WebSocket"
keywords: "Java,Spring,WebSocket"
description: "Spring与WebSocket"
date: 2016-05-24 18:00
categories: "后端技术"
---

## WebSocket介绍

在相当长的一段时间里面，我们为了web页面具有良好的交互及实时性，采用了Long Polling，Server Sent Events，Comet等技术，这些技术在特定场景下都能解决问题，但[WebSocket](https://tools.ietf.org/html/rfc6455)的出现提供了一种新的可能性。WebSocket是HTML5定义的一种协议，这种协议可以实现client与server间全双工、双向的通信。

我们知道，目前的Web服务绝大部分都是基于HTTP的，因此为了使得WebSocket能够被广泛使用，WebSocket决定使用HTTP来作为初始的握手（handshake）。WebSocket的握手基于HTTP中的[协议升级机制](https://developer.mozilla.org/en-US/docs/Web/HTTP/Protocol_upgrade_mechanism)，当服务端收到这个HTTP的协议升级请求后，如果支持WebSocket协议则返回HTTP状态码101。这样，WebSocket的握手便成功了，之后client与server会使用之前HTTP请求所使用的TCP连接来相互发送消息。

这个关于WebSocket的[知乎回答](https://www.zhihu.com/question/20215561)解释的比较有趣，感兴趣的可以看下，本文对于WebSocket的具体协议不做展开。

## WebSocket的子协议

如上所述，WebSocket在握手之后便直接基于TCP进行消息通信，但WebSocket只是TCP上面非常轻的一层，它仅仅将TCP的字节流转换成消息流（文本或二进制），至于怎么解析这些消息的内容完全依赖于应用本身。

因此为了协助client与server进行消息格式的协商，WebSocket在握手的时候保留了一个[子协议](https://tools.ietf.org/html/rfc6455#section-1.9)字段。

这个子协议字段并不是必须的，而且这个字段的值也不是固定的。对于简单的应用，我们完全可以自己约定消息的格式；但对于稍微复杂点的应用，我们可能会希望能够希望快速开发，而不用花费大部分精力来制定复杂的消息格式。

那么问题来了：现在有可用的子协议吗？

答案是肯定的。

[STOMP](http://stomp.github.io/stomp-specification-1.2.html#Abstract)协议是一个简单的消息通信协议，最初只是在脚本语言中使用，但由于其简单实用已经被广泛使用。

我们也可以在WebSocket中将它作为子协议来进行消息通信。

对于Java开发者来说，由于Spring框架提供了STOMP的支持，可以拿来就用，没有比这更好的了。


## <a name="spring-stomp"></a>Spring与STOMP

STOMP中定义了三种消息：

1. SEND：client向server发送消息
2. SUBSCRIBE：client向server订阅某种类型的消息
3. MESSAGE：server向client分发消息

Spring的spring-messaging模块支持STOMP协议，包含了消息处理的关键抽象。下面是一个简单的消息处理示意图：

![message-flow](/assets/websocket/message-flow.png)

关键实体的作用如下：

* Message：消息，里面带有header和payload。
* MessageHandler：处理client消息的实体。
* MessageChannel：解耦消息发送者与消息接收者的实体。举个例子，client可以发送消息到channel，而不用管这条消息最终被谁处理。
* Broker：存放消息的中间件，client可以订阅broker中的消息。


## WebSocket的浏览器兼容性问题

关于WebSocket的另外一个问题是，目前相当一部分浏览器不支持WebSocket协议，譬如IE浏览器只在IE10或者更高版本支持WebSocket。另外，一些受限的代理也可能会禁止HTTP的协议升级，从而阻碍WebSocket的握手与使用。

因此我们在计划使用WebSocket的时候，需要考虑兼容性问题。在不能使用WebSocket的场景下，我们希望client与server仍然可以通过其他方式通信。

这样的话我们写代码的时候岂不是非常困难？因为我们既需要实现WebSocket，同时还需要对于不支持WebSocket的client实现其他方式的通信（例如Long Polling）？

幸运的是，我们拥有[SockJS](https://github.com/sockjs/sockjs-protocol)这么一个解决方案，它向上层暴露一致的WebSocket API，但具体实现会因浏览器而异。SockJS涉及到client端以及server端的实现，client端使用SockJS-client.js，而服务端则根据语言使用各自的SockJS实现。

而Spring中已经集成了SockJS，我们只需要一行代码就可以引入SockJS了。是不是很赞？

## <a name="code"></a>Talk is cheap, show Me the code

啰嗦了那么多，我们来动手写个小demo吧！这个demo需要准备以下环境：

* JDK 1.8+
* Maven 3.0+

首先，创建根目录 **mkdir messaging-stomp-websocket**。

然后在根目录下创建pom.xml：

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


我们先来写server端的代码。

在根目录下使用**mkdir -p src/main/java/hello**来建立层级目录。

在这个demo中，client会向server发送包含名字的JSON格式的消息：

{% highlight json %}

{
    "name": "Dengshenyu"
}

{% endhighlight %}

sever收到消息后，返回表示欢迎的消息：

{% highlight json %}

{
    "content": "Hello, Dengshenyu!"
}

{% endhighlight %}

在server端，我们分别用两个POJO（Plain Old Java Object）来表示这两种消息：

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


现在我们创建一个消息处理的controller，当client发送到“/hello”的STOMP消息，我们会交给这个controller来处理。和Spring MVC里面的请求dispatch一样。

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

需要注意的是：

* @MessageMapping表明一个消息被发送到“/hello”时，这个方法会被调用处理该消息。
* @SendTo表明这个方法处理完后所产生的值会被作为消息发送到“/topic/greetings”这个broker。

最后创建Spring配置类来完成WebSocket、STOMP以及SockJS的配置。

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

需要注意的是：

* @Configuration表明这是一个Spring的配置类。
* @EnableWebSocketMessageBroker表明启用WebSocket消息中间件，以及WebSocket消息处理。
* configureMessageBroker()方法用来配置消息中间件，它通过调用enableSimpleBroker()来创建一个基于内存的消息中间件，这个消息中间件会接收所有需要返回给client的以“/topic”为前缀的消息。同时configureMessageBroker()方法还为@MessageMapping标记的方法所绑定的消息设置了一个“/app”的消息前缀。
* registerStompEndpoints()方法注册了一个“/hello”的endpoint，同时使用了SockJS。这表明client需要使用SockJS来连接这个endpoint。

至此server端已经完成。下面我们写一个简易的client。

首先，使用**mkdir -p src/main/resources/static/**来建立client端目录。

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

* 这个页面关键的JS代码在于connect()方法和sendName()方法，connect()方法用来建立WebSocket连接，成功之后则向server端订阅“/topic/greetings”的消息。sendName()方法用来向server端发送消息。
* 通过这个页面可以看到，SocketJS提供了WebSocket的API，STOMP可以像使用WebSocket一样使用SockJS对象，但实际上SockJS会根据浏览器来不同实现，可能并没有使用WebSockJS来和server通信。

至此，我们代码已经基本写完了！我们来运行下，写一个运行类：

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

撒花~~
