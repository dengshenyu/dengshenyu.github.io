---
layout: post
title: "Kafka的有且仅有一次语义与事务消息"
keywords: "Kafka"
description: "Kafka的有且仅有一次语义与事务消息"
date: 2018-07-28 01:00
categories: "Kafka"
---

最近看到Kafka官方wiki上有一篇关于有且仅有一次语义与事务消息的文档（见[这里](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging#KIP-98-ExactlyOnceDeliveryandTransactionalMessaging-Alittlebitabouttransactionsandstreams)），里面说的非常详细。对于有且仅有一次语义与事务消息是什么东西，大家可以看我的上一篇博客，或者看Kafka的这篇wiki，这里不做展开。这篇文章主要整理关于该语义和事务消息的API接口、数据流和配置。

## 生产者接口

### 生产者API的改动

生产者新增了5个新的方法（initTransactions, beginTransaction, sendOffsets, commitTransaction, abortTransaction），并且发送接口也增加了一个新的异常。见下面：

{% highlight java %}

public interface Producer<K,V> extends Closeable {
   
  /*
   * Needs to be called before any of the other transaction methods. Assumes that
   * the transactional.id is specified in the producer configuration.
   *
   * This method does the following:
   *   1. Ensures any transactions initiated by previous instances of the producer
   *      are completed. If the previous instance had failed with a transaction in
   *      progress, it will be aborted. If the last transaction had begun completion,
   *      but not yet finished, this method awaits its completion.
   *   2. Gets the internal producer id and epoch, used in all future transactional
   *      messages issued by the producer.
   *
   * @throws IllegalStateException if the TransactionalId for the producer is not set
   *         in the configuration.
   */
  void initTransactions() throws IllegalStateException;
   
  /*
   * Should be called before the start of each new transaction.
   *
   * @throws ProducerFencedException if another producer is with the same
   *         transactional.id is active.
   */
  void beginTransaction() throws ProducerFencedException;
   
  /*
   * Sends a list of consumed offsets to the consumer group coordinator, and also marks
   * those offsets as part of the current transaction. These offsets will be considered
   * consumed only if the transaction is committed successfully.
   *
   * This method should be used when you need to batch consumed and produced messages
   * together, typically in a consume-transform-produce pattern.
   *
   * @throws ProducerFencedException if another producer is with the same
   *         transactional.id is active.
   */
  void sendOffsetsToTransaction(Map<TopicPartition, OffsetAndMetadata> offsets,
                                String consumerGroupId) throws ProducerFencedException;
   
  /*
   * Commits the ongoing transaction.
   *
   * @throws ProducerFencedException if another producer is with the same
   *         transactional.id is active.
   */
  void commitTransaction() throws ProducerFencedException;
   
  /*
   * Aborts the ongoing transaction.
   *
   * @throws ProducerFencedException if another producer is with the same
   *         transactional.id is active.
 
 
   */
  void abortTransaction() throws ProducerFencedException;
 
 
  /*
   * Send the given record asynchronously and return a future which will eventually contain the response information.
   *
   * @param record The record to send
   * @return A future which will eventually contain the response information
   *
   */
  public Future<RecordMetadata> send(ProducerRecord<K, V> record);
 
  /*
   * Send a record and invoke the given callback when the record has been acknowledged by the server
   **/
  public Future<RecordMetadata> send(ProducerRecord<K, V> record, Callback callback);
}

{% endhighlight %}

### OutOfOrderSequence异常

如果broker检测出数据丢失，生产者接口会抛出OutOfOrderSequenceException异常。换句话说，就是broker发现序列号比预期序列号高。异常会在Future中返回，并且如果存在callback的话会把异常传给callback。这是一个严重异常，生产者后续调用send, beginTransaction, commitTransaction等方法都会抛出一个IlegalStateException。

## 应用示例

以下是一个使用上述API的简单应用：

{% highlight java %}

public class KafkaTransactionsExample {
  
  public static void main(String args[]) {
    KafkaConsumer<String, String> consumer = new KafkaConsumer<>(consumerConfig);
 
 
    // Note that the ‘transactional.id’ configuration _must_ be specified in the
    // producer config in order to use transactions.
    KafkaProducer<String, String> producer = new KafkaProducer<>(producerConfig);
 
    // We need to initialize transactions once per producer instance. To use transactions,
    // it is assumed that the application id is specified in the config with the key
    // transactional.id.
    //
    // This method will recover or abort transactions initiated by previous instances of a
    // producer with the same app id. Any other transactional messages will report an error
    // if initialization was not performed.
    //
    // The response indicates success or failure. Some failures are irrecoverable and will
    // require a new producer  instance. See the documentation for TransactionMetadata for a
    // list of error codes.
    producer.initTransactions();
     
    while(true) {
      ConsumerRecords<String, String> records = consumer.poll(CONSUMER_POLL_TIMEOUT);
      if (!records.isEmpty()) {
        // Start a new transaction. This will begin the process of batching the consumed
        // records as well
        // as an records produced as a result of processing the input records.
        //
        // We need to check the response to make sure that this producer is able to initiate
        // a new transaction.
        producer.beginTransaction();
         
        // Process the input records and send them to the output topic(s).
        List<ProducerRecord<String, String>> outputRecords = processRecords(records);
        for (ProducerRecord<String, String> outputRecord : outputRecords) {
          producer.send(outputRecord);
        }
         
        // To ensure that the consumed and produced messages are batched, we need to commit
        // the offsets through
        // the producer and not the consumer.
        //
        // If this returns an error, we should abort the transaction.
         
        sendOffsetsResult = producer.sendOffsetsToTransaction(getUncommittedOffsets());
         
      
        // Now that we have consumed, processed, and produced a batch of messages, let's
        // commit the results.
        // If this does not report success, then the transaction will be rolled back.
        producer.endTransaction();
      }
    }
  }
}

{% endhighlight %}

## 新的配置

### broker配置

* transactional.id.timeout.ms：事务协调者超过多长时间没有收到生产者TransactionalId的事务状态更新就认为其过期。默认值为604800000（7天），这个值使得每星期执行一次的生产者任务可以持续维护其ID。
* max.transaction.timeout.ms：事务超时时间。如果client请求事务时间超过这个值，那么broker会在InitPidRequest中返回一个InvalidTransactionTimeout异常。这防止client出现超时时间太长，这会使得消费者消费事务相关的主题时变慢。默认值为900000（15分钟），这是一个保守的上限值。
* transaction.state.log.replication.facto：事务状态主题的副本个数，默认值为3。
* transaction.state.log.num.partitions：事务状态主题的分区个数，默认值为50。
* transaction.state.log.min.isr：事务状态主题每个分区拥有多少个insync的副本才被视为上线。默认为2。
* transaction.state.log.segment.bytes：事务状态主题的日志段大小，默认为104857600字节。

### 生产者配置

* enable.idempotence：是否使用幂等写（默认为false）。如果为false，生产者发送消息请求时不会携带PID字段，保持为与之前的语义一样。如果希望使用事务，那么这个值必须置位true。如果为true，那么会额外要求acks=all，retries > 1，和 max.inflight.requests.per.connection=1。因为如果这些条件不满足，那么无法保证幂等性。如果应用没有显示指明这些属性，那么在启用幂等性时生产者会设置acks=all，retries=Integer.MAX_VALUE，和 max.inflight.requests.per.connection=1。
* transaction.timeout.ms：生产者超过多久没有更新事务状态，事务协调者会将其进行中的事务回滚。这个值会随着InitPidRequest一起发送给事务协调者。如果这个值大于broker设置的max.transaction.timeout.ms，那么请求会抛出InvalidTransactionTimeout异常。默认值为60000，防止下游消费阻塞等待超过1分钟。
* transactional.id：事务投递所使用的TransactionalId值。这个可以保证多个生产者会话的可靠性语义，因为这可以保证在使用相同TransactionalId的情况下，老的事务必须完成才能开启新的事务。需要注意的是，如果启用这个值，必须先设置enable.idempotence为true。此值默认为空，意味着没有使用事务。

### 消费者配置

* isolation.level：以下是可以取的值（默认为read_uncommitted）：1）read_uncommitted：按位移顺序按序消费消息，无论其为提交还是未提交。2）read_committed：按位移顺序按序消费消息，但只消费非事务消息和已提交的事务消息；为了保持位移顺序，read_committed会使得消费者需要在获取到同一事务中的所有消息前需要缓存消息。

## 语义保证

### 生产者幂等性保证

为了实现生产者幂等性语义，我们引入了生产者ID（也称为PID）和消息序列号的概念。每一个新的生产者在初始化的时候都会赋予一个PID。PID的设置是对使用者透明的，不会在客户端中暴露出来。

对于一个指定的PID，序列号从0开始并且单调递增，每个主题分区都有一个序列号序列。生产者发送消息到broker后会增加序列号。broker则在内存中维护每个PID发到主题分区的序列号，一旦发现当前收到的序列号没有比上一次收到的序列号刚好大1，那么就会拒绝当前的生产者请求。如果消息携带的序列号比预期低而导致重复异常，生产者会忽略掉这个异常；如果消息携带的序列号比预期高而导致乱序异常，这就意味着有一些消息可能丢失了，这个异常是非常严重的。

通过这样的方法，就保证了即便生产者在出现失败的情况下进行重试，每个消息也只会在日志中仅出现一次。由于每个新的生产者实例都会分配一个新的唯一PID，因此只能保证单个生产者会话中实现幂等性。

这些幂等的生产者语义对于像指标跟踪和审计等应用可能非常有用。

### 事务保证

事务保证的核心就是，使得应用能够原子性的生产消息到多个分区，写入到这些分区的消息要么都成功要么都失败。

进一步地，由于消费者也是通过写入到位移主题来进行记录的，因此事务的能力可以用来使得应用将消费动作和生产动作原子化，也就是说消息被消费了当且仅当整个“消费-转换-生产”的链条都执行完毕。

另外，有状态的应用也可以实现跨越多个会话的连续性。也就是说，Kafka可以保证跨越应用边界的生产幂等性和事务性。为了达到这个目标，应用需要提供一个唯一ID，而且这个唯一ID能够跨越应用边界保持稳定不变。在下面的阐述中，会使用TransactionalId表示这个ID。TransactionalId和PID是一一对应的，区别在于TransactionalId是用户提供的，至于为什么TransactionalId能够保证跨越生产者会话的幂等性的原因下面来分析。

当提供了这样的一个TransactionalId，Kafka保证：

1. 对于一个TransactionalId，只会有一个活跃的生产者。当具有相同TransactionalId的生产者上线时，会把老的生产者强制下线。
2. 事务恢复跨越应用会话。如果一个应用实例死亡，下一个实例启动时会保证之前进行中的事务会被结束（提交或回滚），这样就保证了新的实例处于一个干净的状态。

需要注意的是，这里提到的事务保证是从生产者的角度来看的。对于消费者，这个保证会稍微弱一点。具体来讲，我们不能保证一个已提交事务的所有消息可以一起被消费。原因如下：

1. 对于compact类型的主题，一个事务中的消息可能被更新的版本所代替。
2. 事务可能跨越日志段。因此当老的日志段被删除了，可能会损失一个事务的开始部分。
3. 消费者可以定位到事务中的任意位置开始消费，因此可能会丢失该事务的开始部分消息。
4. 消费者可能消费不到事务中涉及到的分区。因此不能读取到该事务的所有消息。

## 核心概念

为了实现事务，也就是保证一组消息可以原子性生产和消费，Kafka引入了如下概念；

1. 引入了事务协调者（Transaction Coordinator）的概念。与消费者的组协调者类似，每个生产者会有对应的事务协调者，赋予PID和管理事务的逻辑都由事务协调者来完成。
2. 引入了事务日志（Transaction Log）的内部主题。与消费者位移主题类似，事务日志是每个事务的持久化多副本存储。事务协调者使用事务日志来保存当前活跃事务的最新状态快照。
3. 引入了控制消息（Control Message）的概念。这些消息是客户端产生的并写入到主题的特殊消息，但对于使用者来说不可见。它们是用来让broker告知消费者之前拉取的消息是否被原子性提交。控制消息之前在[这里](https://issues.apache.org/jira/browse/KAFKA-1639)被提到过。
4. 引入了TransactionalId的概念，TransactionalId可以让使用者唯一标识一个生产者。一个生产者被设置了相同的TransactionalId的话，那么该生产者的不同实例会恢复或回滚之前实例的未完成事务。
5. 引入了生产者epoch的概念。生产者epoch可以保证对于一个指定的TransactionalId只会有一个合法的生产者实例，从而保证事务性即便出现故障的情况下。

除了引入了上述概念之外，Kafka还有新的请求类型、已有请求类型的版本升级和新的消息格式，以支持事务。这些细节在本篇文章中不过多涉及。

## 数据流

![data-flow](/assets/kafka-transaction-interface/data-flow.png)

在上面这幅图中，尖角框代表不同的机器，圆角框代表Kafka的主题分区（TopicPartition），对角线圆角框代表运行在broker中的逻辑实体。

每个箭头代表一个rpc或者主题的写入。这些操作的先后顺序见旁边的数字，下面按顺序来介绍这些操作。

### 1. 查询事务协调者（FindCoordinatorRequest请求）

事务协调者是设置PID和管理事务的核心，因此生产者第一件事就是向broker发起FindCoordinatorRequest请求（之前命名为GroupCoordinatorRequest，此版本将其重命名）获取其协调者。

### 2. 获取生产者ID（InitPidRequest请求）

在查询到事务协调者之后，生产者下一步就是获取其生产者ID，这一步是通过向事务协调者发送InitPidRequest来实现。

#### 2.1 如果指定了TransactionalId的话

如果在配置中指定了transactional.id，transactional.id会在InitPidRequest请求中传递过来，transactional.id与生产者ID的映射会在步骤2a中记录到事务日志。这样未来的生产者如果发送了相同的transactional.id则返回这个相同的PID，从而可以恢复或回滚之前未完成的事务。

在返回PID之外，InitPidRequest还会完成如下任务：

1. 增加生产者的epoch值，这样之前的生产者僵尸实例会被断开，不能继续操作事务。
2. 恢复（提交或回滚）之前该PID对应的生产者实例的未完成事务。

InitPidRequest请求是同步的，一旦返回，生产者可以发送数据和开启新的事务。

#### 2.2 如果TransactionalId未指定

如果TransactionalId未指定，会赋予一个新的PID，该生产者可以在其当前会话期间实现幂等性和事务性语义。

### 3. 开启事务（beginTransaction方法）

新的KafkaProducer有一个beginTransaction()方法，调用该方法会开启一个新的事务。生产者在本地状态中记录事务已经开始，只有发送第一个记录时协调者才会知道事务开始状态。

### 4. 消费-转换-生产的循环

在这个阶段中，生产者开始事务中的消费-转换-生产循环，这个阶段比较长而且可能由多个请求组成。

#### 4.1 AddPartitionsToTxnRequest

在一个事务中，如果需要写入一个新的主题分区，那么生产者会发送此请求到事务协调者。协调者在步骤4.1a中会记录该分区添加到事务中。这个信息是必要的，因为这样才能写入提交或回滚标记到事务中的每个分区（见5.2步骤）。如果这是事务写入的第一个分区，那么协调者还会开始事务定时器。

#### 4.2 ProduceRequest

生产者通过一个或多个ProduceRequests请求（在生产者send方法内部发出）写入消息到主题中。这些请求包含PID，epoch和序列号，见图中的4.2a。

#### 4.3 AddOffsetCommitsToTxnRequest

生产者有一个新的sendOffsetsToTransaction方法，该方法可以将消息消费和生产结合起来。方法参数包含一个Map<TopicPartitions, OffsetAndMetadata>和一个groupId。

sendOffsetsToTransaction内部发送一个带有groupId的AddOffsetCommitsToTxnRequests请求到事务协调者，事务协调者从内部的__consumer-offsets主题中根据此消费者组获取到相应的主题分区。事务协调者在步骤4.3a中把这个主题分区记录到事务日志中。

#### 4.4 TxnOffsetCommitRequest

生产者发送TxnOffsetCommitRequest请求到消费协调者来在主题__consumer-offsets中持久化位移（见4.4a）。消费协调者通过请求中的PID和生产者epoch来验证生产者是否允许发起该请求。

已消费的位移在提交事务之后才对外可见，此过程在下面来讨论。


### 5. 提交或回滚事务

消息数据写入之后，使用者需要调用KafkaProducer中的commitTransaction或abortTransaction方法，这两个方法分别为事务的提交和回滚处理方法。

#### 5.1 EndTxnRequest

当生产者结束事务的时候，需要调用KafkaProducer.endTransaction或者KafkaProducer.abortTransaction方法。前者使得步骤4中的数据对下游的消费者可见，后者则从日志中抹除已生产的数据：这些数据不会对用户可见，也就是说下游消费者会读取并丢弃这些回滚消息。

无论调用哪个方法，生产者都是会发起EndTxnRequest请求到事务协调者，然后通过参数来指明事务提交或回滚。接收到此请求后，协调者会：

1. 写入PREPARE_COMMIT或PREPARE_ABORT消息到事务日志（见5.1a）
2. 通过WriteTxnMarkerRequest请求写入命令消息（COMMIT或ABORT）到用户日志中（见下面5.2）
3. 写入COMMITTED或ABORTED消息到事务日志中

#### 5.2 WriteTxnMarkerRequest请求

这个请求是事务协调者发给事务中每个分区的leader的。接收到此请求后，每个broker会写入COMMIT(PID)或ABORT(PID) 控制消息到日志中（步骤5.2a）。

这个消息向消费者指明该PID的消息传递给用户还是丢弃。因此，消费者接收到带有PID的消息后会缓存起来，直到读取到COMMIT或者ABORT消息，然后决定消息是通知用户还是丢弃。

另外，如果事务中涉及到__consumer-offsets主题，那么commit或者abort的标记同样写入到日志中，消费协调者会被告知这些位移是否标记为已消费（事务提交则为已消费，事务回滚则忽略这些位移）。见步骤4.2a。

#### 5.3 写入最后的提交或回滚消息

在commit或abort标记写入到数据日志后，事务协调者写入最终的COMMITTED或ABORTED消息到事务日志，标记该事务已经完成（见图中的步骤5.3）。在这个时候，事务日志中关于这个事务的大部分消息都可以被删除；只需要保留该事务的PID和时间戳，这样可以最终删除关于该生产者的TransactionalId->PID映射，详情可参考PID过期的相关资料。





