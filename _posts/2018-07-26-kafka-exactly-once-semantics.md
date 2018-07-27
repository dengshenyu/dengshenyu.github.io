---
layout: post
title: "【译】Kafka-Exactly-Once语义"
keywords: "Kafka"
description: "Kafka-Exactly-Once语义"
date: 2018-07-26 01:00
categories: "Kafka"
---


Kafka消息有且仅有一次（Exactly Once）的语义已经被讨论太多次了，但从来都没实现。最近Confluent公司的CTO，Neha Narkhede，写了[一篇文章](https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/)关于Kafka 0.11版本带来的梦寐以求的特性--有且仅有一次的语义。

在此之前，业界都认为这个在分布式系统中几乎是不可能实现的。Kafka这次发布吸引了社区的广泛关注。在[Hevo](https://hevodata.com/)（译者注：笔者所在的公司），Kafka是核心基础设施，因此我们对于Kafka的有且仅有一次语义非常好奇。这篇文章分析Kafka是怎么实现有且仅有一次的语义的，并且展示怎么使用这个特性。

## 为什么我们需要有且仅有一次的语义？

至少一次（At Least Once）的语义能够保证每条消息至少存储一次，不会发生丢失。对于可靠性来说，这是很重要的。但是另一方面，这也带来了由于生产者重试而导致消息重复的问题。

例如，broker可能在提交消息和返回ack给生产者中间宕机，在这种情况下，生产者会由于没有收到响应而重试，从而导致消息流的重复。因此，生产者请求的幂等性是非常重要的，这能够保证即便出现重试或者broker故障，每条消息也只会出现一次。

![at-least-once](/assets/kafka-exactly-only-once/at-least-once.png)

这个语义使得系统更加具有鲁棒性，但在跨越多个分区的场景下还是有点问题。为了保证跨分区的鲁棒性，我们需要事务保证--也就是原子性写入多个分区的能力。这意味着，原子性提交批量消息到多个分区，这些消息要么全部提交成功，要么全部失败。

下面来分析下Kafka-0.11版本中的这些功能。

## 幂等的生产者

幂等性也就是有且仅有一次的意思。为了防止一个消息被处理多次，必须要保证消息在Kafka中只持久化一次。在生产者初始化过程中，它会被赋予一个唯一ID，也称为生产者ID或者PID。

PID和一个序列号会包含在消息中，一起被发送到broker。序列号从0开始单调递增，对于每一个PID/TopicPartition对来说，当且仅当消息的序列号比上一次提交消息的序列号刚好大1，broker才会接收这个消息。如果不是消息重复的话，生产者会重发消息。

![idempotent-producer](/assets/kafka-exactly-only-once/idempotent-producer.png)

当发现重复时，生产者会忽略当前的消息及序列号。如果发生序列号太高导致序列号乱序异常，那么说明一些消息可能丢失了。

当生产者重启时，会被赋予新的PID。因此，幂等性只保证在一个生产者会话里面。在一个会话里面，即便存在故障导致重发，消息也不会重复存储。但是如果生产者本身拿到的来源数据就是重复的，那么这些重复不能避免，Kafka不能解决生产者拿到重复消息的场景。因此在某些场景下，我们可能需要一个额外的去重系统。

## 原子性事务

具有幂等性的生产者保证了每个分区下消息只投递一次的语义，为了在多个分区场景下也实现这个语义，Kafka提供了原子性事务，这使得应用可以原子性地生产消息到多个分区。这些分区的写入要么全部成功，要么全部失败。应用需要提供一个唯一的事务ID给生产者，这个ID在应用的所有会话中都是保持唯一的。事务ID和PID是一一对应的，也即是说对于指定的事务ID，Kafka保证只有一个活跃的生产者，如果存在老的具有相同事务ID的生产者那么会使其下线。Kafka保证新的生产者实例处于一个干净的状态，任何未结束的事务都会被完成（提交或回滚）。

以下是一个代码样例，展现如何使用新的生产者事务API来将消息原子性的发送到多个主题：

{% highlight java %}

{
    producer.initTransactions();
    try{
     producer.beginTransaction();
        producer.send(record0);
        producer.send(record1);
        producer.sendOffsetsToTxn(…);
        producer.commitTransaction();
    } catch( ProducerFencedException e) {
        producer.close();
    } catch( KafkaException e ) {
        producer.abortTransaction();
    }
} 

{% endhighlight %}

可以参考[这篇文章](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging#KIP-98-ExactlyOnceDeliveryandTransactionalMessaging-DataFlow)来获取这个新API的工作细节。

## 生产者的异常

新的生产者异常有：

* ProducerFencedException：如果系统中存在另外一个拥有相同事务ID的生产者则抛出此异常；
* OutOfOrderSequenceException：如果broker检测出消息数据乱序，那么生产者会抛出此异常。如果broker接收到一个更高的序列号，那么说明有些消息可能丢失了；如果接收到一个更低的序列号，说明消息是重复的。

## 消费者

在消费者侧，消费者可以通过改变隔离级别来得到不同的行为。

在一个高并发场景中，隔离级别用来保持性能与可靠、一致与冗余之间的平衡。下面是Kafka消费者的两个隔离级别：

1. 读提交（read_committed）：在事务提交之后，读取事务和非事务的消息。读提交的消费者使用分区的结束位移而不是client端的缓冲，这个位移是该分区第一个处于事务进行中的消息位移，也被称为“最大稳定位移”（Last Stable Offset，即LSO）。一个读提交的消费者只会读取LSO之前的消息，并且过滤掉期间回滚的事务消息。
2. 读未提交（read_uncommitted）：按位移顺序读取消息，不等待事务提交。这个语义类似于老的Kafka消费者语义。

## 性能损耗

Kafka在0.11这个版本中提高了性能，生产者吞吐量提高了20%多，消费者吞吐量提高了50%多，并且减少了20%的磁盘占用。磁盘占用的降低得益于消息格式的改变。

## 消息格式的改变

老的消息格式固定大小为34个字节。新的消息格式增加了PID，Epoch和序列号，因此增加了53个字节的消息额外消耗。新的消息格式分为MessageSet和Message，如下所示：


{% highlight java %}

MessageSet =>
  FirstOffset => int64
  Length => int32
  PartitionLeaderEpoch => int32
  Magic => int8
  CRC => int32
  Attributes => int16
  LastOffsetDelta => int32 {NEW}
  FirstTimestamp => int64 {NEW}
  MaxTimestamp => int64 {NEW}
  PID => int64 {NEW}
  ProducerEpoch => int16 {NEW}
  FirstSequence => int32 {NEW}
  Messages => [Message]
Message => {ALL FIELDS ARE NEW}
  Length => varint
  Attributes => int8
  TimestampDelta => varint
  OffsetDelta => varint
  KeyLen => varint
  Key => data
  ValueLen => varint
  Value => data
Headers => [Header] /* Note: The array uses a varint for the number of headers. */ 
Header => HeaderKey HeaderVal
  HeaderKeyLen => varint
  HeaderKey => string
  HeaderValueLen => varint
  HeaderValue => data

{% endhighlight %}

MessageSet包含了一个Message列表。这里不会深入太多消息格式的细节，但是值得提的是，发送批量消息会降低总的消息大小。MessageSet中包含初始的位移和时间戳，而集合中的每个消息则包含位移增量和时间戳增量，这样节省了空间。而且，同一个批的消息PID和epoch都是相同的，因此这两个属性也是包含在MessageSet的。这些设计都减少了数据冗余，批消息越大，新格式的额外开销占比越小。

例如[cwiki.apache.org](http://cwiki.apache.org/)中提到的一个例子，假设发送50个消息，消息的key大小为100字节，并且包含时间戳。如果使用新的消息格式，批里面每个消息只会占用7个字节的额外开销（消息大小占用2个字节，属性占用1个字节，时间戳增量占用1个字节，位移增量占用1个字节，key大小占用1个字节）。如下所示：

![format](/assets/kafka-exactly-only-once/format.png)

## 总结

以前Kafka API中最薄弱的一环是生产者API，新的有且仅有一次的消息语义终于极大的增强了生产者的特性。

但是，必须要指出的是，只有消费者把它的输出存储到Kafka时（比如像Kafka Stream），才能实现整个Kafka链路的有且仅有一次消息语义。

举个常见的例子，假如消费者输出到数据库而且更新是非幂等的，那么可能会存在重复数据的情况，比如这个场景：消费者更新数据库后，还没有提交位移就挂了。而如果消费者选择先提交位移，那么可能在更新数据库前挂了，这样就导致“消息丢失”了。


> 原文地址：[kafka-exactly-once](https://hevodata.com/blog/kafka-exactly-once/)
