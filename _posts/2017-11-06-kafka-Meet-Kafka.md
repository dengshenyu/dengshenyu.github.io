---
layout: post
title: "Kafka系列（一）初识Kafka"
keywords: "Kafka，分布式系统"
description: "Kafka系列（一）--初识Kafka"
date: 2017-11-06 22:00
categories: ["分布式系统"]
---

> 本系列文章为对《Kafka：The Definitive Guide》的学习整理，希望能够帮助到大家

每个公司都是由数据驱动的。我们无时无刻都在产生数据，而这些数据最终会被用来分析挖掘信息。例如我们在亚马逊上面点击感兴趣的商品，这个点击的数据会被作为日后推荐系统的数据来源。

从数据产生到分析，这个过程越短，得到的响应与反馈也就越快；我们花越少精力来传输数据，就可以节省更多的时间来集中在这些数据的商业价值上。

## 发布/订阅的消息机制

在讨论Kafka之前，我们需要了解什么是发布/订阅的消息机制，以及它为什么这么重要。发布/订阅是这么一种模式：消息（message）的发送者（publisher）不直接把消息发送给接收者，它只是以某种方式将消息分类，而接收者（subscriber）订阅特定类型的消息。发布/订阅系统通常有一个中间代理（broker）作为中间节点来协调这个过程。

### 起因

很多使用发布订阅系统的场景都是相同的：只是想要一个简单的消息队列或者进程间通信的通道。

来看个具体的例子。假如，我们有一个应用，现在需要实时统计应用的监控数据，我们可以应用直接连接到监控面板，并推送数据到面板上，如下所示：

![monitor](/assets/meet-kafka/monitor.png)

需求很简单，解决方案也很简单。但后来我们想对过去一段时间的监控数据进行分析，而这个需求监控面板满足不了，于是我们又另外写了一个分析系统来收集这些监控数据，于是应用同时需要推送数据到这个分析系统。更头疼的是，我们的应用多了，这些应用也在产生监控数据。这时候，你身边的同事想：使用拉取（poll）的方式更好！因此，他为这些应用添加了实时拉取的接口，于是现在整个系统变成这样了：

![monitor-2](/assets/meet-kafka/monitor-2.png)

这个系统的技术债是很明显的，因此我们打算进行重构。我们计划构建一个独立的模块，这个模块接收所有应用的监控数据，并且提供查询这些数据的接口。这个系统简化成如下所示：

![monitor-3](/assets/meet-kafka/monitor-3.png)

恭喜！你已经构建了一个发布订阅的消息系统！

### 独立的队列系统

上面的系统只是用来收集监控数据的。另外你的同事可能在做相同的工作，但是他的任务是收集日志；另一个同事可能在收集用户的页面行为数据...现在整个系统看上去像是这样的：

![multi](/assets/meet-kafka/multi.png)

当然这个系统也比之前点到点直连的系统要好得多，但这个系统的问题是存在重复劳动。每个中间模块都是类似的，我们想要的是只维护一套队列系统，而这个队列系统能够支持各种各样的数据！

## Kafka

Apache Kafka就是用来解决这个问题的基于发布/订阅的消息系统。它往往也被描述为**分布式提交日志系统**或者**分布式流式处理系统**。我们知道，文件系统或者数据库的提交日志是持久化存储的，而且可以用来被按序重放来得到系统的当前状态；与此类似，Kafka内部的数据也是持久化且有序的，这些数据可以分布在不同的机器上来做横向扩展提供高性能，并且能够容忍系统故障。

### 消息与批量提交

Kafka的内部数据单元称为**消息**，消息类似于数据库中的一行或者一条记录。对于Kafka来说，消息只是一个字节数组，它不关心数据的格式；另外，每个消息都有一个可选的元数据（metadata），称为键值（key），同样键值也是一个字节数组，Kafka也不关心其格式。当消息被写到分区（partition）时，消息的键值可以控制这个分派的过程。最简单的做法是对这个键值进行哈希，把得到的哈希值对分区数量进行取模，来决定消息分派到哪个分区。这样可以保证拥有相同键值的消息可以被写入同一个分区。

为了更高效，消息以批量提交的方式来写入Kafka。这些批量的消息都拥有相同的主题（topic）和分区（Partition）。使用批量提交是因为，对于每个消息来说，花费在网络往返传输的时间上比较多。当然，这个是吞吐（throughput）和延迟（latency）的权衡，批量提交的消息越多，单位时间可以处理的消息也就越多，但每个消息的延迟就越大。另外，批量提交的消息是经过压缩的，因此传输和存储更高效，但代价是处理要花费更多的时间。

### 数据的结构

虽然对于Kafka来说消息只是字节数组，但是在实践中，我们建议消息内容是具有格式的，这样可以更容易解析。可选的消息格式有很多，譬如JSON、XML或者Apache Avro。其中，Apache Avro有很多优点：

* 序列化更加紧凑;
* 数据格式与消息内容分开，在改变数据格式时不需要生成新的代码；
* 提供强数据类型，但又提供了很好的后向扩展性；
* ...

一个保持一致的数据格式是很重要的，因为它能够使得消息的读和写可以解耦。如果读和写不能很好的解耦，那么如果数据格式变更时，订阅者必须更新代码同时支持新老两种格式，这样发布者才能发布新的消息。

### 主题（topic）与分区（partition）

在Kafka中，消息以主题（topic）来分类，主题的概念类似于数据库的表。主题可以分成多个分区（partition），一个分区对应于一个单独的日志。消息不断追加到日志的末尾，在读取时从头到尾按序读取。一个主题通常有几个分区，分区内部有序，但分区相互之间不保证顺序。下图是一个拥有4个分区的主题：

![topic](/assets/meet-kafka/topic.png)

分区可以分布在不同的机器上，这也就意味着一个主题可以水平扩展到多个机器，以提供冗余度和横向扩展性。

当讨论Kafka这样的系统时，**数据流（stream）**这个词是常常用到的，这个词表示数据从生产者流向消费者。这样的数据操作方式与Hadoop这样的离线运算框架非常不同，后者被设计为离线非实时处理大数据集。

### 生产者与消费者

Kafka客户端有两种基本类型：生产者（producer）和消费者（consumer）。除此之外，还有用来做数据集成的Kafka Connect API和流式处理的Kafka Streams等高阶客户端，但这些高阶客户端底层仍然是生产者和消费者API，它们只不过是在上层做了封装。

生产者（也称为发布者）创建消息，通常来说生产者不关心消息被写入到哪个分区，在默认情况下Kafka会将消息均衡分配到所有的分区。但在某些情况下我们可能希望控制消息的分配，这可以通过消息键值和分配器（partitioner）来完成，分配器会对键值进行哈希并将消息分配到特定分区，这保证了拥有相同键值的消息会被分配到相同的分区。当然我们也可以自定义分配器，使用特定的业务策略来将消息映射到分区。

消费者（也称为订阅者）读取消息，通常订阅一个或多个主题。在读取时，消费者记录当前已经读取的消息位移（offset）。位移是一个持续增长的整数值，分区内部的每个消息具有唯一的位移值。通过记录每个分区的已读取消息的位移（可以在Zookeeper或者Kafka内部记录），消费者可以停止或者重启而不丢失消费位置。

消费者以消费组（consumer group）来工作，消费组包含一个或多个消费者，它们一起协作来消费同一个主题的消息。消费组保证主题内一个分区只被消费组内的一个消费者来消费。下图是一个例子，例子中分区0和分区3分别被消费者0和消费者2消费，而分区1和2则被消费1消费。

![consumer](/assets/meet-kafka/consumer.png)

通过这种方式，对于大的消息队列，消费者可以水平扩展来提高读取性能。另外如果某个消费者出现故障，消费组内的其他消费者会接管它的分区。

### broker和集群

一个Kafka服务器也称为broker（译者：可以翻译为中间代理，但因为直接使用broker比较顺口，因此下文均以broker来称呼），broker接收生产者的消息并赋予其位移值，然后写入到磁盘；broker同时服务消费者拉取分区消息的请求，返回目前已经提交的消息。使用特定的机器硬件，一个broker每秒可以处理成千上万的分区和百万量级的消息。

若干个broker组成一个集群（cluster），其中集群内某个broker会成为集群控制器（cluster controller），它负责管理集群，包括分配分区到broker、监控broker故障等。在集群内，一个分区由一个broker负责，这个broker也称为这个分区的leader；当然一个分区可以被复制到多个broker上来实现冗余，这样当存在broker故障时可以将其分区重新分配到其他broker来负责。下图是一个样例：

![broker](/assets/meet-kafka/broker.png)

Kafka的一个关键性质是日志保留（retention），我们可以配置主题的消息保留策略，譬如只保留一段时间的日志或者只保留特定大小的日志。当超过这些限制时，老的消息会被删除。我们也可以针对某个主题单独设置消息过期策略，这样对于不同应用可以实现个性化。

### 多集群

随着业务发展，我们往往需要多集群，通常处于下面几个原因：

* 基于数据的隔离；
* 基于安全的隔离；
* 多数据中心（容灾）

当构建多个数据中心时，往往需要实现消息互通。举个例子，假如用户修改了个人资料，那么后续的请求无论被哪个数据中心处理，这个更新需要反映出来。又或者，多个数据中心的数据需要汇总到一个总控中心来做数据分析。

上面说的分区复制冗余机制只适用于同一个Kafka集群内部，对于多个Kafka集群消息同步可以使用Kafka提供的MirrorMaker工具。本质上来说，MirrorMaker只是一个Kafka消费者和生产者，并使用一个队列连接起来而已。它从一个集群中消费消息，然后往另一个集群生产消息。下图是一个简单的例子，里面使用MirrorMaker从两个本地集群中聚合消息到一个汇总集群，然后复制这个汇总集群到其他的数据中心。

![mirror-maker](/assets/meet-kafka/maker.png)



