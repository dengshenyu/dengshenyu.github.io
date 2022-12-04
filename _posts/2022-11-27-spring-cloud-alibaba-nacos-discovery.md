---
layout: post
title: 云原生组件分析--Spring Cloud Alibaba Nacos Discovery
---

# 0x01 Spring Cloud Alibaba是什么？

Spring Cloud Alibaba是连接Spring Cloud应用到阿里微服务组件的Spring框架，你只需要增加几个注解和少量的配置，即可使用微服务注册、调用、限流降级等能力。按照其官方文档所示，当前Spring Cloud Alibaba支持的组件有：

* [Sentinel](https://github.com/alibaba/Sentinel)：限流降级组件，支持流量控制、熔断降级和系统负载保护等功能。
* [Nacos](https://github.com/alibaba/Nacos)：微服务注册中心和配置中心组件，支持动态服务注册发现和配置管理功能。
* [RocketMQ](https://rocketmq.apache.org/)：消息队列组件，基于高可用分布式集群技术，提供低延时、高可靠的消息发布和订阅能力。
* [Seata](https://github.com/seata/seata)：分布式事务组件，提供高性能微服务分布式事务解决方案。
* [Alibaba Cloud OSS](https://www.aliyun.com/product/oss)：对象存储组件，提供海量、安全、低成本和高可靠的存储服务。
* [Alibaba Cloud SchedulerX](https://cn.aliyun.com/aliware/schedulerx)：分布式任务调度组件，提供秒级、精准、高可靠和高可用的定时任务调度能力。
* [Alibaba Cloud SMS](https://www.aliyun.com/product/sms)：短信服务组件，提供覆盖全球的短信通讯能力。

上面这些组件中，部分已经开源，你可以自己搭建相应组件并使用Spring Cloud Alibaba连接至该组件。或者，使用阿里云的SaaS化服务，将应用连接至云端的组件。

# 0x02 Spring Cloud Alibaba Nacos Discovery

按官方文档所说，
> Nacos 是一个 Alibaba 开源的、易于构建云原生应用的动态服务发现、配置管理和服务管理平台。
> 使用 Spring Cloud Alibaba Nacos Discovery，可基于 Spring Cloud 的编程模型快速接入 Nacos 服务注册功能。

在使用上，首先需要通过**dependencyManagement**来声明Spring Cloud Alibaba版本：

```
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-alibaba-dependencies</artifactId>
            <version>2021.0.4.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

这里做下说明：
* 在mvn框架中，dependencyManagement的作用是，如果你在dependencies中直接或间接依赖了对应的包，那么就会使用dependencyManagement里所指定的包版本。
* type为pom，且scope为import，这意味着是将spring-cloud-alibaba-dependencies包的pom文件里指定的包依赖版本引用进来。也就是说，我们指定的不是spring-cloud-alibaba-dependencies包的版本，而是spring-cloud-alibaba-dependencies包里pom文件里声明的所有依赖版本。而spring-cloud-alibaba-dependencies里声明了Nacos、Sentinel、Seata等各个组件的版本。

通过spring-cloud-alibaba-dependencies声明版本后，我们需要引用spring-cloud-starter-alibaba-nacos-discovery依赖，如下：

```
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
```

当然除了这些，你还应该引入Spring Boot和Spring Cloud的相关依赖。Spring Cloud Alibaba Nacos Discovery官方文档贴出了一个最简单的样例，

```
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>open.source.test</groupId>
    <artifactId>nacos-discovery-test</artifactId>
    <version>1.0-SNAPSHOT</version>
    <name>nacos-discovery-test</name>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>${spring.boot.version}</version>
        <relativePath/>
    </parent>

    <properties>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
        <java.version>1.8</java.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.cloud</groupId>
                <artifactId>spring-cloud-dependencies</artifactId>
                <version>${spring.cloud.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
            <dependency>
                <groupId>com.alibaba.cloud</groupId>
                <artifactId>spring-cloud-alibaba-dependencies</artifactId>
                <version>${spring.cloud.alibaba.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>

        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

类似的，spring-cloud-dependencies声明了Spring Boot和Spring Cloud依赖包版本，spring-boot-starter-web和spring-boot-starter-actuator则引入相关依赖。除此之外，还引入了spring-boot-maven-plugin这个maven构建插件。默认情况下，如果不使用spring-boot-maven-plugin插件，那么**mvn package**命令打包出来的jar包只会包含当前的代码类，而不会有Spring Boot启动加载类，如下所示：

![spring-boot-maven-plugin-before](/assets/spring-cloud-alibaba-nacos-discovery/spring-boot-maven-plugin-before.png)

上图中META-INF是Java关于Jar包的元数据信息，application.properties为项目定义的配置文件，com/目录则为项目的Java编译后代码。而如果引入了spring-boot-maven-plugin，则编译后的Jar包结构如下所示：

![spring-boot-maven-plugin-after](/assets/spring-cloud-alibaba-nacos-discovery/spring-boot-maven-plugin-after.png)

* BOOT-INF：spring-boot-maven-plugin增加的目录，BOOT-INF/classes为本项目的Java代码编译后的类文件，而BOOT-INF/lib则为当前项目引入的依赖库；
* META-INF：Jar包的元数据目录；
* org/springframework：Spring Boot的启动框架类。

由META-INF/MANIFEST.MF文件可以看出，项目的启动类已经改成org.springframework.boot.loader.JarLauncher：

![spring-boot-maven-plugin-bootstrap](/assets/spring-cloud-alibaba-nacos-discovery/spring-boot-maven-plugin-bootstrap.png)

最后，我们需要加几行配置到application.properties（或者application.yaml）来指明Nacos地址、本地服务名和注册端口：

```
server.port=8081
spring.application.name=nacos-provider
spring.cloud.nacos.discovery.server-addr=127.0.0.1:8848
```

* server.port：指明了本地服务端口是**8081**
* spring.application.name：本地服务名为**nacos-provider**
* spring.cloud.nacos.discovery.server-addr：Nacos注册中心地址为**127.0.0.1:8848**

当然，你需要在本地启动一个Nacos注册中心，启动起来也非常简单，更多信息参考[Nacos](https://github.com/alibaba/nacos)官方文档。完成上面配置后，可以通过如下代码来启动一个Provider：

```
@SpringBootApplication
@EnableDiscoveryClient
public class NacosProviderDemoApplication {

    public static void main(String[] args) {
        SpringApplication.run(NacosProviderDemoApplication.class, args);
    }

    @RestController
    public class EchoController {
        @GetMapping(value = "/echo/{string}")
        public String echo(@PathVariable String string) {
            return "Hello Nacos Discovery " + string;
        }
    }
}
```

代码中通过 Spring Cloud 原生注解 @EnableDiscoveryClient 开启服务注册发现功能。Consumer侧的pom依赖和application.properties配置也一样，代码则如下所示：

```
@SpringBootApplication
@EnableDiscoveryClient
public class NacosConsumerApplication {

    @LoadBalanced
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    public static void main(String[] args) {
        SpringApplication.run(NacosConsumerApplication.class, args);
    }

    @RestController
    public class TestController {

        private final RestTemplate restTemplate;

        @Autowired
        public TestController(RestTemplate restTemplate) {this.restTemplate = restTemplate;}

        @RequestMapping(value = "/echo/{str}", method = RequestMethod.GET)
        public String echo(@PathVariable String str) {
            return restTemplate.getForObject("http://service-provider/echo/" + str, String.class);
        }
    }
}
```

Consumer同样通过 Spring Cloud 原生注解 @EnableDiscoveryClient 开启服务注册发现功能，除此外还给 RestTemplate 实例添加 @LoadBalanced 注解，开启 @LoadBalanced 与 Ribbon 的集成。


