---
layout: post
title: "Kafka系列（三）Kafka生产者：写消息到Kafka"
keywords: "Kafka，分布式系统"
description: "Kafka系列（三）--Kafka生产者：写消息到Kafka"
date: 2017-11-12 15:00
categories: ["分布式系统"]
---

> 本系列文章为对《Kafka：The Definitive Guide》的学习整理，希望能够帮助到大家

本章我们将会讨论Kafka生产者是如何发送消息到Kafka的。Kafka项目有一个生产者客户端，我们可以通过这个客户端的API来发送消息。生产者客户端是用Java写的，但Kafka写消息的协议是开放的，所以我们也可以自己实现一个非Java语言的客户端。开源的非Java语言客户端见[这个wiki](https://cwiki.apache.org/confluence/display/KAFKA/Clients)。

## 概要

当我们发送消息之前，先问几个问题：每条消息都是很关键且不能容忍丢失么？偶尔重复消息可以么？我们关注的是消息延迟还是写入消息的吞吐量？

举个例子，有一个信用卡交易处理系统，当交易发生时会发送一条消息到Kafka，另一个服务来读取消息并根据规则引擎来检查交易是否通过，将结果通过Kafka返回。对于这样的业务，消息既不能丢失也不能重复，由于交易量大因此吞吐量需要尽可能大，延迟可以稍微高一点。

再举个例子，假如我们需要收集用户在网页上的点击数据，对于这样的场景，少量消息丢失或者重复是可以容忍的，延迟多大都不重要只要不影响用户体验，吞吐则根据实时用户数来决定。

不同的业务需要使用不同的写入方式和配置。后面我们将会讨论这些API，现在先看下生产者写消息的基本流程：

![overview](/assets/kafka-producer/overview.png)

流程如下：

1. 首先，我们需要创建一个ProducerRecord，这个对象需要包含消息的主题（topic）和值（value），可以选择性指定一个键值（key）或者分区（partition）。
2. 发送消息时，生产者会对键值和值序列化成字节数组，然后发送到分配器（partitioner）。
3. 如果我们指定了分区，那么分配器返回该分区即可；否则，分配器将会基于键值来选择一个分区并返回。
4. 选择完分区后，生产者知道了消息所属的主题和分区，它将这条记录添加到相同主题和分区的批量消息中，另一个线程负责发送这些批量消息到对应的Kafka broker。
5. 当broker接收到消息后，如果成功写入则返回一个包含消息的主题、分区及位移的RecordMetadata对象，否则返回异常。
6. 生产者接收到结果后，对于异常可能会进行重试。

## 创建Kafka生产者

创建Kafka生产者有三个基本属性：

* bootstrap.servers：属性值是一个host:port的broker列表。这个属性指定了生产者建立初始连接的broker列表，这个列表不需要包含所有的broker，因为生产者建立初始连接后会从相应的broker获取到集群信息。但建议指定至少包含两个broker，这样一个broker宕机后生产者可以连接到另一个broker。
* key.serializer：属性值是类的名称。这个属性指定了用来序列化键值（key）的类。Kafka broker只接受字节数组，但生产者的发送消息接口允许发送任何的Java对象，因此需要将这些对象序列化成字节数组。key.serializer指定的类需要实现org.apache.kafka.common.serialization.Serializer接口，Kafka客户端包中包含了几个默认实现，例如ByteArraySerializer、StringSerializer和IntegerSerializer。
* value.serializer：属性值是类的名称。这个属性指定了用来序列化消息记录的类，与key.serializer差不多。

下面是一个样例代码：

{% highlight java %}

private Properties kafkaProps = new Properties();
kafkaProps.put("bootstrap.servers", "broker1:9092,broker2:9092");
kafkaProps.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
kafkaProps.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");

producer = new KafkaProducer<String, String>(kafkaProps);

{% endhighlight %}

创建完生产者后，我们可以发送消息。Kafka中有三种发送消息的方式：

* 只发不管结果（fire-and-forget）：只调用接口发送消息到Kafka服务器，但不管成功写入与否。由于Kafka是高可用的，因此大部分情况下消息都会写入，但在异常情况下会丢消息。
* 同步发送（Synchronous send）：调用send()方法返回一个Future对象，我们可以使用它的get()方法来判断消息发送成功与否。
* 异步发送（Asynchronous send）：调用send()时提供一个回调方法，当接收到broker结果后回调此方法。

本章的例子都是单线程发送的，但生产者对象是线程安全的，它支持多线程发送消息来提高吞吐。需要的话，我们可以使用多个生产者对象来进一步提高吞吐。

## 发送消息到Kafka

最简单的发送消息方式如下：

{% highlight java %}

ProducerRecord<String, String> record = new ProducerRecord<String, String>("CustomerCountry", "Precision Products", "France");

try {
  producer.send(record);
} catch (Exception e) {
  e.printStackTrace();
}

{% endhighlight %}

这里做了如下几件事：

1. 我们创建了一个ProducerRecord，并且指定了主题以及消息的key/value。主题总是字符串类型的，但key/value则可以是任意类型，在本例中也是字符串。需要注意的是，这里的key/value的类型需要与serializer和生产者的类型匹配。
2. 使用send()方法来发送消息，该方法会返回一个RecordMetadata的Future对象，但由于我们没有跟踪Future对象，因此并不知道发送结果。如前所述，这种方式可能会丢失消息。
3. 虽然我们忽略了发送消息到broker的异常，但是我们调用send()方法时仍然可能会遇到一些异常，例如序列化异常、发送缓冲区溢出异常等等。

### 同步发送消息

同步发送方式可以简单修改如下：


{% highlight java %}

ProducerRecord<String, String> record = new ProducerRecord<String, String>("CustomerCountry", "Precision Products", "France");

try {
  producer.send(record).get();
} catch (Exception e) {
  e.printStackTrace();
}

{% endhighlight %}

注意到，这里使用了Future.get()来获取发送结果，如果发送消息失败则会抛出异常，否则返回一个RecordMetadata对象。发送失败异常包含：1）broker返回不可恢复异常，生产者直接抛出该异常；2）对于broker其他异常，生产者会进行重试，如果重试超过一定次数仍不成功则抛出异常。

可恢复异常指的是，如果生产者进行重试可能会成功，例如连接异常；不可恢复异常则是进行重试也不会成功的异常，例如消息内容过大。

### 异步发送消息

首先了解下什么场景下需要异步发送消息。假如生产者与broker之间的网络延时为10ms，我们发送100条消息，发送每条消息都等待结果，那么需要1秒的时间。而如果我们采用异步的方式，几乎没有任何耗时，而且我们还可以通过回调知道消息的发送结果。

异步发送消息的样例如下：

{% highlight java %}

private class DemoProducerCallback implements Callback {
  @Override
  public void onCompletion(RecordMetadata recordMetadata, Exception e) {
    if (e != null) {
	  e.printStackTrace();
	}
  }
}

ProducerRecord<String, String> record = new ProducerRecord<String, String>("CustomerCountry", "Precision Products", "France");

producer.send(record, new DemoProducerCallback());

{% endhighlight %}

异步回调的类需要实现org.apache.kafka.clients.producer.Callback接口，这个接口只有一个onCompletion方法。当Kafka返回异常时，异常值不为null，代码中只是简单的打印，但我们可以采取其他处理方式。

## 生产者的配置

上面我们只配置了bootstrap.servers和序列化类，其实生产者还有很多配置，上面只是使用了默认值。下面来看下这些配置参数。

**acks**

acks控制多少个副本必须写入消息后生产者才能认为写入成功，这个参数对消息丢失可能性有很大影响。这个参数有三种取值：

* acks=0：生产者把消息发送到broker即认为成功，不等待broker的处理结果。这种方式的吞吐最高，但也是最容易丢失消息的。
* acks=1：生产者会在该分区的群首（leader）写入消息并返回成功后，认为消息发送成功。如果群首写入消息失败，生产者会收到错误响应并进行重试。这种方式能够一定程度避免消息丢失，但如果群首宕机时该消息没有复制到其他副本，那么该消息还是会丢失。另外，如果我们使用同步方式来发送，延迟会比前一种方式大大增加（至少增加一个网络往返时间）；如果使用异步方式，应用感知不到延迟，吞吐量则会受异步正在发送中的数量限制。
* acks=all：生产者会等待所有副本成功写入该消息，这种方式是最安全的，能够保证消息不丢失，但是延迟也是最大的。

**buffer.memory**

这个参数设置生产者缓冲发送的消息的内存大小，如果应用调用send方法的速度大于生产者发送的速度，那么调用会阻塞或者抛出异常，具体行为取决于block.on.buffer.full（这个参数在0.9.0.0版本被max.block.ms代替，允许抛出异常前等待一定时间）参数。

**compresstion.type**

默认情况下消息是不压缩的，这个参数可以指定使用消息压缩，参数可以取值为snappy、gzip或者lz4。snappy压缩算法由Google研发，这种算法在性能和压缩比取得比较好的平衡；相比之下，gzip消耗更多的CPU资源，但是压缩效果也是最好的。通过使用压缩，我们可以节省网络带宽和Kafka存储成本。

**retries**

当生产者发送消息收到一个可恢复异常时，会进行重试，这个参数指定了重试的次数。在实际情况中，这个参数需要结合retry.backoff.ms（重试等待间隔）来使用，建议总的重试时间比集群重新选举群首的时间长，这样可以避免生产者过早结束重试导致失败。

**batch.size**

当多条消息发送到一个分区时，生产者会进行批量发送，这个参数指定了批量消息的大小上限（以字节为单位）。当批量消息达到这个大小时，生产者会一起发送到broker；但即使没有达到这个大小，生产者也会有定时机制来发送消息，避免消息延迟过大。

**linger.ms**

这个参数指定生产者在发送批量消息前等待的时间，当设置此参数后，即便没有达到批量消息的指定大小，到达时间后生产者也会发送批量消息到broker。默认情况下，生产者的发送消息线程只要空闲了就会发送消息，即便只有一条消息。设置这个参数后，发送线程会等待一定的时间，这样可以批量发送消息增加吞吐量，但同时也会增加延迟。

**client.id**

这个参数可以是任意字符串，它是broker用来识别消息是来自哪个客户端的。在broker进行打印日志、衡量指标或者配额限制时会用到。

**max.in.flight.requests.per.connection**

这个参数指定生产者可以发送多少消息到broker并且等待响应，设置此参数较高的值可以提高吞吐量，但同时也会增加内存消耗。另外，如果设置过高反而会降低吞吐量，因为批量消息效率降低。设置为1，可以保证发送到broker的顺序和调用send方法顺序一致，即便出现失败重试的情况也是如此。

**timeout.ms, request.timeout.ms, metadata.fetch.timeout.ms**

这些参数控制生产者等待broker的响应时间。request.timeout.ms指定发送数据的等待响应时间，metadata.fetch.timeout.ms指定获取元数据（例如获取分区的群首信息）的等待响应时间。timeout.ms则指定broker在返回结果前等待其他副本（与acks参数相关）响应的时间，如果时间到了但其他副本没有响应结果，则返回消息写入失败。

**max.block.ms**

这个参数指定应用调用send方法或者获取元数据方法（例如partitionFor）时的阻塞时间，超过此时间则抛出timeout异常。

**max.request.size**

这个参数限制生产者发送数据包的大小，数据包的大小与消息的大小、消息数相关。如果我们指定了最大数据包大小为1M，那么最大的消息大小为1M，或者能够最多批量发送1000条消息大小为1K的消息。另外，broker也有message.max.bytes参数来控制接收的数据包大小。在实际中，建议这些参数值是匹配的，避免生产者发送了超过broker限定的数据大小。

**receive.buffer.bytes, send.buffer.bytes**

这两个参数设置用来发送/接收数据的TCP连接的缓冲区，如果设置为-1则使用操作系统自身的默认值。如果生产者与broker在不同的数据中心，建议提高这个值，因为不同数据中心往往延迟比较大。


最后讨论下顺序保证。Kafka保证分区的顺序，也就是说，如果生产者以一定的顺序发送消息到Kafka的某个分区，那么Kafka在分区内部保持此顺序，而且消费者也按照同样的顺序消费。但是，应用调用send方法的顺序和实际发送消息的顺序不一定是一致的。举个例子，如果retries参数不为0，而max.in.flights.requests.per.session参数大于1，那么有可能第一个批量消息写入失败，但是第二个批量消息写入成功，然后第一个批量消息重试写入成功，那么这个顺序乱序的。因此，如果需要保证消息顺序，建议设置max.in.flights.requests.per.session为1，这样可以在第一个批量消息发送失败重试时，第二个批量消息需要等待。

## 序列化

上面提到了Kafka自带的序列化类，现在来看下如何使用其他的序列化策略。

### 自定义序列化

如果我们发送的消息不是整数或者字符串时，我们需要自定义序列化策略或者使用通用的Avro、Thrift或者Protobuf这些序列化方案。下面来看下如何使用自定义的序列化方案，以及存在的问题。

假如我们要发送的消息对象是这么一个Customer：

{% highlight java %}

public class Customer {
    private int customerID;
    private String customerName;
    
    public Customer(int ID, String name) {
        this.customerID = ID;
        this.customerName = name;
    }
    public int getID() {
        return customerID;
    }
    public String getName() {
        return customerName;
    } 
}

{% endhighlight %}

那么，自定义的序列化类实现样例如下：

{% highlight java %}

import org.apache.kafka.common.errors.SerializationException;
import java.nio.ByteBuffer;
import java.util.Map;

public class CustomerSerializer implements Serializer<Customer> {
    @Override
    public void configure(Map configs, boolean isKey) {
        // nothing to configure
    }

    @Override
    /**
     We are serializing Customer as:
     4 byte int representing customerId
     4 byte int representing length of customerName in UTF-8 bytes (0 if name is
     Null)
     N bytes representing customerName in UTF-8
     */
    public byte[] serialize(String topic, Customer data) {
        try {
            byte[] serializedName;
            int stringSize;
            if (data == null)
                return null;
            else {
                if (data.getName() != null) {
                    serializeName = data.getName().getBytes("UTF-8");
                    stringSize = serializedName.length;
                } else {
                    serializedName = new byte[0];
                    stringSize = 0;
                }
            }
            ByteBuffer buffer = ByteBuffer.allocate(4 + 4 + stringSize);
            buffer.putInt(data.getID());
            buffer.putInt(stringSize);
            buffer.put(serializedName);
            return buffer.array();
        } catch (Exception e) {
            throw new SerializationException("Error when serializing Customer to byte[] " + e);
        } 
    }

    @Override
    public void close() {
        // nothing to close
    } 
}

{% endhighlight %}

我们将Customer的ID和名字进行了序列化，通过这个序列化对象，我们可以发送Customer的对象消息。但这样的序列化存在很多问题，比如想要将ID升级为Long型或者增加新的Customer域时，我们需要兼容新老消息。尤其是公司内多个团队同时消费Customer数据时，他们需要同时修改代码进行兼容。

因此，建议使用JSON、Apache Avro、Thrift或者Protobuf这些成熟的序列化/反序列化方案。下面来看下如何使用Avro来进行序列化。

### 使用Avro序列化

Apache Avro是一个语言无关的序列化方案，使用Avro的数据使用语言无关的结构来描述，例如JSON。Avro一般序列化成字节文件，当然也可以序列化成JSON形式。Kafka使用Avro的好处是，当写入消息需要升级协议时，消费者读取消息可以不受影响。

例如，原始的协议可能是这样的：

{% highlight json %}

{
  "namespace": "customerManagement.avro",
  "type": "record",
  "name": "Customer",
  "fields": [
      {"name": "id", "type": "int"},
      {"name": "name",  "type": "string""},
      {"name": "faxNumber", "type": ["null", "string"], "default": "null"}
  ] 
}

{% endhighlight %}

在这个例子中，id和name是必须的，而faxNumber是可选的，默认为null。

在使用这个格式一段时间后，我们需要升级协议，去掉faxNumber属性并增加email属性：


{% highlight json %}

{
  "namespace": "customerManagement.avro",
  "type": "record",
  "name": "Customer",
  "fields": [
      {"name": "id", "type": "int"},
      {"name": "name",  "type": "string""},
      {"name": "email", "type": ["null", "string"], "default": "null"}
  ] 
}

{% endhighlight %}


消费者在处理消息时，会通过getName()、getId()和getFaxNumber()来获取消息属性，对于新的消息，消费者获取的faxNumber会为null。如果消费者升级应用代码，调用getEmail而不是getFaxNumber，对于老的消息，getEmail会返回null。

这个例子体现了Avro的优势：即使修改消息的结构而不升级消费者代码，消费者仍然可以读取数据而不会抛出异常错误。不过需要注意下面两点：

* 写入的消息格式与期待读取的格式需要兼容，关于兼容可以参考[这个文档](http://bit.ly/2t9FmEb)
* 消费者需要知道写入数据的格式，对于Avro文件来说写入格式包含在文件中，对于Kafka我们接下来看下如何处理。

### 在Kafka中使用Avro消息

当使用Avro序列化成文件时，我们可以将数据的结构添加到文件中；但对于Kafka，如果对于每条Avro消息我们都附上消息结构，那么将会增加差不多一倍的开销。因此，我们可以使用模式注册中心（Schema Registry）的架构模式，将消息的结构存储在注册中心，这样消费者可以从注册中心获取数据的结构。模式注册中心不是Kafka项目的一部分，但有很多开源的方案可以考虑。在下面的例子中，我们将会使用Confluent Schema Registry来作为注册中心，其开源代码见[GitHub](https://github.com/confluentinc/schema-registry)，或者我们可以通过[Confluent Platform](http://docs.confluent.io/current/installation.html)来安装。如果你计划使用Confluent Schema Registry，那么可以参考[这个文档](http://docs.confluent.io/current/schema-registry/docs/index.html)。

使用模式注册中心的话，我们需要存储消息的所有格式到注册中心，然后在消息记录中添加格式的ID，这样消费者可以通过这个ID从注册中心获取数据的模式以进行反序列化。看上去很麻烦，我们需要存储数据的结构以及在消费端拉取数据结构，但是不需要担心，这些工作已经由serializer/deserializer来完成了，应用只需要使用Avro提供的serializer即可。

整体处理流程如下：

![avro](/assets/kafka-producer/avro.png)

下面是一个发送生成的Avro对象到Kafka的代码样例（代码生成信息参考[Avro文档](http://avro.apache.org/docs/current/)）：

{% highlight java %}

Properties props = new Properties();
props.put("bootstrap.servers", "localhost:9092");
props.put("key.serializer", "io.confluent.kafka.serializers.KafkaAvroSerializer");
props.put("value.serializer", "io.confluent.kafka.serializers.KafkaAvroSerializer");
props.put("schema.registry.url", schemaUrl);

String topic = "customerContacts";
int wait = 500;
Producer<String, Customer> producer = new KafkaProducer<String, Customer>(props);

// We keep producing new events until someone ctrl-c
while (true) {
    Customer customer = CustomerGenerator.getNext();
    System.out.println("Generated customer " + customer.toString());
    ProducerRecord<String, Customer> record = new ProducerRecord<>(topic, customer.getId(), customer);
    producer.send(record);
}


{% endhighlight %}

其中，

1. 我们使用KafkaAvroSerializer来序列化对象，注意它可以处理原子类型，上面代码中使用其来序列化消息的key。
2. schema.registry.url参数指定了注册中心的地址，我们将数据的结构存储在该注册中心。
3. Customer是生成的对象，生产者发送的消息类型也为Customer。
4. 我们创建一个包含Customer的记录并发送，序列化的工作由KafkaAvroSerializer来完成。

当然，我们也可以使用通用的Avrod对象而不是生成的Avro对象，对于这种情况，我们需要提供数据的结构：


{% highlight java %}

Properties props = new Properties();
props.put("bootstrap.servers", "localhost:9092");
props.put("key.serializer", "io.confluent.kafka.serializers.KafkaAvroSerializer");
props.put("value.serializer", "io.confluent.kafka.serializers.KafkaAvroSerializer");
props.put("schema.registry.url", schemaUrl);

String schemaString = "{\"namespace\": \"customerManagement.avro\",
                        \"type\": \"record\", " +
                        "\"name\": \"Customer\"," +
                        "\"fields\": [" +
                            "{\"name\": \"id\", \"type\": \"int\"}," +
                             "{\"name\": \"name\", \"type\": \"string\"}," +
                             "{\"name\": \"email\", \"type\": [\"null\",\"string\"], \"default\":\"null\" }" +
                       "]}";

Producer<String, GenericRecord> producer = new KafkaProducer<String, GenericRecord>(props);

Schema.Parser parser = new Schema.Parser();
Schema schema = parser.parse(schemaString);

for (int nCustomers = 0; nCustomers < customers; nCustomers++) {
    String name = "exampleCustomer" + nCustomers;
    String email = "example " + nCustomers + "@example.com";
    GenericRecord customer = new GenericData.Record(schema);
    customer.put("id", nCustomer);
    customer.put("name", name);
    customer.put("email", email);
   
    ProducerRecord<String, GenericRecord> data = new ProducerRecord<String,GenericRecord>("customerContacts",name, customer);
    
    producer.send(data);
}


{% endhighlight %}

这里我们仍然使用KafkaAvroSerializer，也提供模式注册中心的地址；但我们现在需要自己提供Avro的模式，而这个之前是由Avro生成的对象来提供的，我们发送的对象是GenericRecord，在创建的时候我们提供了模式以及写入的数据。最后，serializer会知道如何从GenericRecord中取出模式并且存储到注册中心，然后序列化对象数据。

## 分区

我们创建消息的时候，必须要提供主题和消息的内容，而消息的key是可选的，当不指定key时默认为null。消息的key有两个重要的作用：1）提供描述消息的额外信息；2）用来决定消息写入到哪个分区，所有具有相同key的消息会分配到同一个分区中。

如果key为null，那么生产者会使用默认的分配器，该分配器使用轮询（round-robin）算法来将消息均衡到所有分区。

如果key不为null而且使用的是默认的分配器，那么生产者会对key进行哈希并根据结果将消息分配到特定的分区。注意的是，在计算消息与分区的映射关系时，使用的是全部的分区数而不仅仅是可用的分区数。这也意味着，如果某个分区不可用（虽然使用复制方案的话这极少发生），而消息刚好被分配到该分区，那么将会写入失败。另外，如果需要增加额外的分区，那么消息与分区的映射关系将会发生改变，因此尽量避免这种情况。

**自定义分配器**

现在来看下如何自定义一个分配器，下面将key为Banana的消息单独放在一个分区，与其他的消息进行分区隔离：

{% highlight java %}

import org.apache.kafka.clients.producer.Partitioner;
import org.apache.kafka.common.Cluster;
import org.apache.kafka.common.PartitionInfo;
import org.apache.kafka.common.record.InvalidRecordException;
import org.apache.kafka.common.utils.Utils;

public class BananaPartitioner implements Partitioner {
    public void configure(Map<String, ?> configs) {}
    public int partition(String topic, Object key, byte[] keyBytes, Object value, byte[] valueBytes, Cluster cluster) {
    
    List<PartitionInfo> partitions = cluster.partitionsForTopic(topic);
    int numPartitions = partitions.size();
    if ((keyBytes == null) || (!(key instanceOf String)))
        throw new InvalidRecordException("We expect all messages to have customer name as key")
    if (((String) key).equals("Banana"))
        return numPartitions; // Banana will always go to last partition
   
     // Other records will get hashed to the rest of the partitions
    return (Math.abs(Utils.murmur2(keyBytes)) % (numPartitions - 1))
    }
    
    public void close() {}
 
}

{% endhighlight %}

## 废弃的生产者API

本章我们讨论了org.apache.kafka.clients包中的生产者API，这个包还包含了SyncProducers和AsyncProducer这两个老的API，由于当前新的生产者API已经支持了这两个老API的功能，新用户不建议使用老的API，这里也不再展开。









