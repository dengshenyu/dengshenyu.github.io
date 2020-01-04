---
layout: post
title: Spring Boot Starter是什么？
---

在工作中我们经常能看到各种各样的springboot starter，如spring-cloud-netflix、spring-cloud-alibaba等等。这些starter究竟有什么作用呢？

在了解这些starter之前，我们需要先大概知道Spring MVC与Spring Boot的关系。在我大学刚毕业的时候，大家都还在用Spring MVC框架。这个框架当时已经是Java服务框架的事实标准，构建一个Java项目都会使用Spring MVC。但它的缺点在于，需要编写各种各样的xml文件来管理Bean，某个程度上说我们是在面向xml编程。

直到出现了Spring Boot。一夜之间，xml文件消失了，取而代之的是代码、注解和配置文件。甚至我们不需要一个外部的运行容器，如tomcat、Jetty等等，这些运行容器都嵌入到Spring Boot框架中。我们只需要执行`SpringApplication.run(Application.class, args);`，然后一切就能正常工作！

这一切少不了Spring Boot自动装配的功劳。关于自动装配，Spring Boot官方文档是这么说的：

> Spring Boot auto-configuration attempts to automatically configure your Spring application based on the jar dependencies that you have added.

Spring Boot框架会根据当前运行时的jar依赖来自动生成并装配相应的Bean，文档上举了一个例子：假如HSQLDB在你的classpath下，并且你没有手动配置任何的数据库连接Bean，那么Spring Boot会自动装配一个内存的数据库。另外，自动装配还支持根据配置属性和自定义自动装配条件，功能非常强大。

好了，现在我们再回过头来看什么是starter。其实starter就是一个写好自动装配逻辑的Jar依赖，我们只要引用这个starter，那么当程序运行时的依赖库、配置属性或其他条件满足starter中定义的逻辑时，starter就会自动装配我们的运行环境。

举个例子，当我们引用[spring-cloud-alibaba-nacos-discovery](https://github.com/alibaba/spring-cloud-alibaba/tree/master/spring-cloud-alibaba-nacos-discovery)这个starter时，并且增加几个服务注册发现的配置，那么我们的应用就具备了微服务的能力。当然，除此之外，你还需要一个注册中心。该starter中并不包含注册中心，它只是帮你初始化当前的微服务注册、发现、调用、客户端负载均衡环境，让你只需要一个@Autowired的注解就能使用微服务的能力。

## 自动装配原理

其实自动装配的原理也很简单，它是通过`@Configuration`和`@Conditional`注解来工作的。`@Configuration`注解是Spring中用来声明Bean的；而`@Conditional`代表了一类条件注解，表示当且仅当满足了一定条件之后，使用`@Configuration`的类才真正创建并装配Bean。

但问题又来了，我们使用starter时是只引用了一个jar包，Spring Boot框架是怎么知道jar包中的自动装配逻辑呢？答案是`META-INF/spring.factories`文件。Spring Boot会检查你的jar包中是否存在`META-INF/spring.factories`文件，如果存在则会进一步读取其中的`EnableAutoConfiguration`配置项，该配置项包含了jar包中的自动装配类，例如：

```
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
com.mycorp.libx.autoconfigure.LibXAutoConfiguration,\
com.mycorp.libx.autoconfigure.LibXWebAutoConfiguration
```

如果我们的自动装配存在上下文依赖，我们还可以使用`@AutoConfigureAfter`和`@AutoConfigureBefore`来声明装配顺序。

## 条件注解

上面已经提到了自动装配的条件注解，也就是@Conditional注解。其中最常用的一个是@ConditionalOnMissingBean，这个条件注解可以让我们提供一个默认行为，如果不喜欢默认行为，那么可以通过自定义Bean来覆盖掉默认Bean。

下面是自动装配中可用的条件注解。

* @ConditionalOnClass / @ConditionalOnMissingClass：根据是否存在特定类来自动装配；
* @ConditionalOnBean / @ConditionalOnMissingBean: 根据是否存在特定Bean来自动装配；
* @ConditionalOnProperty：根据Spring属性值来自动装配；
* @ConditionalOnResource：根据是否存在特定资源文件来自动装配；
* @ConditionalOnWebApplication / @ConditionalOnNotWebApplication：根据是否为'Web 应用'来自动装配，一个'Web应用'意味着使用Spring的WebApplicationContext，并且定义了session scope或者有一个StandardServletEnvironment；
* @ConditionalOnExpression：根据SpEL表达式来自动装配；

## starter包规范

Spring Boot官方文档推荐一个starter应当包含如下两个部分：

* autoconfigure模块：实现自动装配的逻辑；
* starter模块：集成autoconfigure模块、依赖库和其他依赖，用户只需要引用这个starter那么就可以使用。

如果分开这两个模块做成jar包比较麻烦，也可以将它们合成一个大的模块，也就是最终的starter包。

在starer包命名上，Spring Boot官方包一般会以spring-boot为前缀，而其他自定义的包则建议不能以spring-boot开头，即便使用不同的groupId。假如我们需要创建一个“acme”库的starter，那么autoconfigure模块可以命名为acme-spring-boot-autoconfigure，而starter模块可以命名为acme-spring-boot-starter；而如果你选择将这两个模块合成一个模块，那么就采取acme-spring-boot-starter就行。

另外，如果starter使用了一些配置项，那么这些配置项应当放在特定的命名空间（即前缀）下，不能放在Spring Boot配置项所在的命名空间下，如server、management、spring等等。

## 生成配置项元数据

对于使用了@ConfigurationProperties的配置类，我们可以通过spring-boot-configuration-processor这个jar包来生成元数据文件，生成后的文件为META-INF/spring-configuration-metadata.json。这样做的好处是，IDE里面可以显示配置的含义。
