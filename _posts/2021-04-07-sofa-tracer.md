---
layout: post
title: 工作笔记--Sofa Tracer
---

自从Google发表了Dapper论文之后，各种链路跟踪系统和工具层出不穷。整体看分为两种方案，一种为基于Java Agent的无侵入式追踪方案，另一种为提供侵入式SDK的追踪方案。这里的侵入式是指，是否需要我们手动引入SDK依赖并且在代码中配置或调用。这几天在研究的由蚂蚁开源的[Sofa Tracer](https://github.com/sofastack/sofa-tracer)便是采取侵入式SDK的解决方案。

Sofa Tracer本身只负责埋点，并不提供收集数据的服务端。它的链路数据会输出到本地日志中，分为digest（摘要）日志和stat（统计）日志两种。其中摘要日志中会输出每个请求的调用详情，一般包含TraceId/SpanId信息、耗时、状态码、方法名等基本信息，但不涉及到方法参数和返回值。统计日志则输出一段时间内某种请求的聚合统计数据，比如次数、总耗时等等。

根据其文档介绍，Sofa Tracer具有以下特点：
* 基于 [OpenTracing](http://opentracing.io/documentation/pages/spec.html) 规范提供分布式链路跟踪解决方案。遵循OpenTracing规范的好处是，Sofa Tracer可以跟其他链路跟踪服务进行集成，比如Sofa Tracer的埋点数据可以上报到[Zipkin](https://github.com/sofastack-guides/sofa-tracer-guides/blob/master/tracer-sample-with-zipkin)服务端。
* 提供异步落地磁盘的日志打印能力：这个能力就是基于[Disruptor](https://github.com/LMAX-Exchange/disruptor)这个高性能无锁队列框架进行日志输出。
* 支持日志自清除和滚动能力：这个能力其实没啥好说的...
* 基于 SLF4J MDC 的扩展能力：这个能力可以使得我们可以通过修改日志配置文件，就可以在原来业务中打印的SLF4J日志里输出TraceId和SpanId。
* 界面展示能力：这个能力其实是需要依托于数据上报到Zipkin进行展示，额严格来说并不是Sofa Tracer自身的能力。
* 统一配置能力：Sofa Tracer提供了很多配置项，可以通过修改配置项来调整它的运行时行为。

整体看，Sofa Tracer并没有太多亮点，唯一值得一提的可能是它遵循了OpenTracing规范，可以跟其他链路跟踪产品进行集成。

上面说到Sofa Tracer是基于侵入式SDk的解决方案，如果我们在项目里使用Sofa Tracer，那么需要做如下事情：
* 引入Sofa Boot框架，替代原来的SpringBoot框架。Sofa Boot其实并没有完全替代SpringBoot，它本身还是使用SpringBoot框架的，但是SofaBoot自身在启动加载过程中需要做额外的一些初始化过程。
* 引入tracer-sofa-boot-starter依赖。这个依赖是Sofa Tracer的核心依赖，里面包含MQ、DB、Redis、RPC等各种埋点插件。
* 修改代码或配置。这一步不一定是必须的，根据具体资源类型而定。比如，对于SpringMVC框架，Sofa Tracer是通过添加Filter来实现的，不需要我们手动修改配置或者代码。但是对于Kafka读写消息来说，需要我们手动使用Sofa提供的包装类来封装原来的Consumer（或Provider）；当调用包装类来读写消息时，Sofa Tracer会在包装类中进行埋点，然后再调用Consumer（或Provider）进行读写。

当前Sofa Tracer支持的埋点框架为如下绿色的部分：
![sofa tracer](/assets/sofa-tracer/sofa-tracer.png)

由图可知，Sofa Tracer支持SpringMVC、HTTPClient、MQ、Redis、DB等常用框架，咋一看满足需求，但实际上距离一款成熟的链路跟踪产品还有很长距离。而在实际使用过程中，Sofa Tracer也有很多问题，例如：
* 不支持新版本的RocketMQ埋点；
* 不支持0.10.x老版本的Kafka埋点；（阿里云上默认的就是0.10.x版本Kafka，情何以堪...）
* 缺乏说明文档，比如Redis埋点、Kafka埋点、RocketMQ埋点等等；
* 各种插件的埋点机制不同；
* ...

最后，Sofa Tracer已经发布至少3年多，至今只有800多个Github Star。你还选择使用Sofa Tracer吗？





