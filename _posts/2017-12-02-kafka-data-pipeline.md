---
layout: post
title: "Kafka系列（七）数据管道"
keywords: "Kafka，分布式系统"
description: "Kafka系列（七）数据管道"
date: 2017-12-02 19:00
categories: ["分布式系统"]
---

> 本系列文章为对《Kafka：The Definitive Guide》的学习整理，希望能够帮助到大家

当我们使用Kafka来构建数据管道的时候，通常有两种主要的场景：1）Kafka是数据的起点或终点，比如从Kafka传输数据到S3或者从MongoDB传输数据到Kafka；2）Kafka作为数据的中间缓冲区，比如构建Twitter到Elasticsearch的数据管道时，Twitter先把数据传输到Kafka，然后Kafka再将数据传输到Elasticsearch。

使用Kafka构建数据管道可以将数据的生产者和消费者进行解耦，并且能够保证高可靠以及高性能。另外在0.9版本，Kafka加入了Kafka Connect这个新的API，使得将Kafka集成到数据管道更加方便。

下面来看下数据管道的一些具体细节。

## 构建数据管道的考虑因素

### 时间线

在实际中，有一些系统的数据可能每天进行一次数据处理，有一些系统可能希望数据从产生到消费只有毫秒级延迟，而另外的系统则介于这两个极端之间。一个优秀的数据集成系统应当能满足不同场景的时间线要求，并且能够支持时间线的迁移（因为实际应用中需求是不断变化的）。Kafka具备这样的性质，既支持准实时的数据传输，也支持定时的批量数据传输，并且保证数据可靠存储以及水平扩展。在Kafka中，生产者可以根据需要来决定写入Kafka的时机，而一旦数据到达Kafka，消费者可以立即读取（其实消费者也可以定时批量读取，取决于使用场景）。

在这个场景中，Kafka充当数据的大缓冲区角色，并且解耦了生产者与消费者的时间敏感度要求：生产者可以实时产生数据而消费者定期消费数据，反之亦然。

### 可靠性

我们需要避免单点故障，并且在发生故障时能够快速的自动恢复。对于核心系统来说，即便是秒级的不可用也有可能造成巨大的损失，因此系统可用性极为重要。另外，数据传输可靠性也非常重要，一些系统能够容忍数据丢失，但更多情况下业务需要的是至少一次（at-least-once）的数据传输保证。至少一次意味着数据一旦生产成功，那么必定会到达终点，但有可能会出现数据重复出现的情况。在某些情况下，我们甚至需要有且仅有一次（exactly-once）的数据传输，这意味着数据一旦生产必须到达终点，而且不允许数据丢失或者重复。

在[这篇文章](http://nahai.me/%E5%88%86%E5%B8%83%E5%BC%8F%E7%B3%BB%E7%BB%9F/2017/11/21/kafka-data-delivery.html)中，我们讨论过了Kafka的可用性和可靠性。Kafka本身能够提供至少一次的数据传输，而通过与外部系统（具备事务性质或者支持唯一键）结合使用能够保证数据有且仅有一次的语义。值得一提的是，Kafka Connect这个API让外部系统与Kafka结合更为方便，使得实现端到端的有且仅有一次的语义更简单。

### 高吞吐

数据管道一般需要支持高吞吐，而且更为重要的是在流量激增的情况下仍然能正常运行。通过使用Kafka，我们可以将生产者与消费者的处理能力进行解耦。如果某个时刻生产者的生产速度远超于消费者的消费速度，那么数据会存放在Kafka中直至消费，也就是说Kafka具备流量削峰的特性。另外，我们可以通过增加消费者或者生产者来分别提高两端的处理能力。

总的来说，Kafka是一个高吞吐的分布式系统，在集群情况下每秒处理百兆级别的数据并不是什么难事，我们也不需要担心在数据量增长的情况下系统不能横向扩展。另外，Kafka Connect使得数据处理不仅可以横向扩展，并且可以并行化，后面我们会深入讨论这一点。

### 数据格式

构建数据管道的一个重要考虑因素是不同数据格式的支持程度。在实际应用中，我们的数据库或者其他存储系统的存储格式通常是多种多样的，比如说可能源数据格式是XML或者关系型的，存储到Kafka中是Avro类型的，最后可能需要转换成JSON格式以便写入Elasticsearch。

Kafka能够满足不同的数据类型要求，在前面系列文章中，我们讨论过生产者和消费者如何使用不同的序列化/反序列化来支持多种数据格式。另外，Kafka Connect的内存数据具有自己的数据类型，但后面我们会进一步看到，我们可以通过增加可插拔的转换器来支持不同的数据格式。

有一点需要注意的是，数据源与数据终点的数据格式通常具有自己的数据结构（Schema），当数据源的数据结构改变时，我们可能需要同时更新数据终点的数据结构。一个经典的例子为，当我们构建MySQL到Hive的数据管道时，如果MySQL增加了一列，那么当我们写入新数据到Hive时需要保证新的列也以某种形式添加到Hive中。

在支持不同数据格式之外，一个通用的数据集成框架应当能支持数据源与数据终点的不同特性。比如，Syslog是一个主动推送数据的数据源，而关系型数据库则要求我们主动拉取它的数据；HDFS只支持数据追加，而其他系统则允许追加和更新。

### 数据转换

构建数据管道时我们有如下两种数据转换方案：

* ELT（Extract-Transform-Load）：这种方案意味着数据管道负责做数据转换，这样做的好处是可以节省目标系统的转换时间和存储空间。但这种方案也有一个缺点，那就是数据管道的转换与下游的依赖需要时刻保持同步。比如，如果我们构建MongoDB到MySQL的数据管道，并且在数据管道中进行数据过滤并且移除某些域，那么MySQL中只能看到部分数据；如果后续我们需要访问这些缺失的数据域，那么数据管道需要重建并且重新处理历史数据。
* ELT（Extract-Load-Transform）：这种方案意味着数据管道做最少的转换（大部分情况下只是转换数据格式），终点的数据与源数据基本一样，这样做的好处是目标系统拥有极大的处理灵活性（因为能看到几乎原始的数据），并且由于数据处理与过滤只在目标系统上进行，减轻追溯问题的复杂程度。这种方案的缺点是目标系统会消耗较多的存储空间，并且的转换也会消耗CPU资源。

### 安全性

对于数据管道来说，安全性包含如下几个方面：

* 经过数据管道的数据是加密的吗？这个问题在跨数据中心时尤其突出。
* 谁允许对数据管道进行修改？
* 如果数据管道需要从访问受限的地方读取或写入数据，它是否能正确的进行身份验证？

Kafka支持对数据传输进行加密，以及支持身份验证（通过SASL）和授权。授权能够保证包含隐私数据的主题在未经授权的情况下不能被读取。另外，Kafka还提供授权与非授权的访问记录，并且能够跟踪主题中的事件来源以及谁进行了何种修改。

### 错误处理

认为数据始终是正确的是一件很危险的事情，我们需要提前考虑错误处理。例如，是否能阻止错误的记录进入管道？是否能从分析失败的记录恢复数据？错误记录是否能被修复以及重新处理？如果不良事件被当做正常事件处理了，但过了几天才发现，这会这么样？

由于Kafka能够在一段时间内保存所有事件，因此在需要的情况下我们可以回溯并且进行错误恢复。

### 耦合与敏捷

数据管道的一个重要作用就是将数据源与目标系统进行解耦，但在某些情况下如果不加以注意便会发生耦合：

* 专门定制管道：有一些公司会针对不同的应用专门定制管道，比如使用Logstash转储日志到Elasticsearch，使用Flume转储日志到HDFS，使用GoldenGate从Oracle获取数据并写入HDFS，等等...这样做会将数据管道与特定的终端耦合在一起，并且意味着每一个新系统都需要搭建新的数据管道。
* 结构元数据缺失：如果数据管道不包含结构元数据而且不允许结构变化，那么其实我们已经将产生数据的源系统与消费数据的目标系统耦合在一起。假如数据从Oracle数据库流向HDFS，DBA在数据库中添加了一列，在数据管道不包含结构元数据而且不允许结构变化的情况下，目标系统要么处理数据失败，要么需要升级应用代码。因此，数据管道应该能支持结构变化，每个独立的团队都可以根据需要来在合适的时刻修改应用逻辑。
* 过度处理：前面已经提到，一些数据处理会在数据管道中进行，毕竟数据管道负责把数据转移到不同的系统。但如果数据管道进行了过度的处理（比如数据清洗、数据聚合），那么会导致下游使用数据的系统与数据管道耦合在一起。最好的处理方式应该为，数据管道尽可能保留元数据的属性，只是做简单的格式转换，允许下游系统来决定他们需要什么样的数据。

## 什么时候使用Kafka Connect？

当写入Kafka或者从Kafka读取时，我们可以使用传统的生产者/消费者客户端，或者使用Kafka Connect和connector。那应该怎么选择呢？

生产者/消费者客户端是嵌入到应用中的，换句话说，如果我们能够修改连接应用的代码，那么可以使用生产者/消费者客户端来写入和读取数据。而如果我们需要将Kafka连接到数据存储系统（或者将数据存储系统连接到Kafka），那么我们可以直接使用Connect以及相应的connector即可。如果对于某个数据存储系统，不存在与其匹配的connector，那么我们既可以使用生产者/消费者客户端，也可以使用Connect。但仍然推荐使用Connect，因为它开箱即用，提供了许多有用的功能，比如配置管理、位移存储、并行化、错误处理、不同数据类型支持等等。

## Kafka Connect

Kafka Connect是Kafka的一部分，它提供了可扩展的方式将Kafka的数据转移到数据存储系统，或者从数据存储系统转移到Kafka。它提供了相应的API以及运行环境，以便我们开发connector插件。connector插件会被Kafka Connect执行并且用来转移数据。Kafka Connect以集群方式运行，每个节点均安装有connector插件，并且提供REST的API接口来配置和管理connector。数据源的connector只需要负责从源系统读取数据，并且转化为Connect数据对象；而目标系统的connector则负责接收Connect数据对象，以及写入到目标系统。

此外，Kafka Connect包含转换器来支持在Kafka中使用不同的数据格式，比如JSON或者Avro。这里提醒下，Kafka中的数据格式是可以独立于源系统（及其connector）与目标系统（及其connector）的。

下面来简单看下如何使用Kafka Connect。

### 运行Connect

Kafka Connect包含在Kafka安装包中，无需额外单独安装。如果我们打算在线上环境使用Kafka Connect来传输大量数据，最好将Connect单独运行。因此，我们可以在全部机器都安装Kafka，一些启动broker，另外一些启动Connect。

启动Connect节点与启动broker是差不多的，都是通过启动脚本和配置文件来启动：

{% highlight bash %}

bin/connect-distributed.sh config/connect-distributed.properties

{% endhighlight %}

其中，关键的配置如下：

* bootstrap.servers：Connect连接的broker节点列表，connector会发送数据到这些broker，或者从这些broker中读取数据。我们不需要指明集群中的所有broker，但推荐至少指明3个broker。
* group.id：拥有相同的group.id的Connect节点同属于一个Connect集群。
* key.converter和value.converter：这两个配置设置Kafka中存储的数据格式，默认为JSONConverter（也就是JSON格式），也可以设置为AvroConverter（Avro格式）。

有一些converter可能会有自己额外的配置参数，比如我们可以通过key.converter.schema.enable和key.converter.schema.enable来设置JSONConverter的消息里面是否包含消息结构。

rest.host.name和rest.port通常已经配置了，这让我们可以通过REST的API来监控Connect运行情况。假如我们以集群方式启动，那么可以通过如下API来验证是否启动成功：

{% highlight bash %}

gwen$ curl http://localhost:8083/
{"version":"0.10.1.0-SNAPSHOT","commit":"561f45d747cd2a8c"}

{% endhighlight %}

上面的结果表明我们运行的Kafka版本为0.10.1.0。另外我们也可以查看当前支持哪些connector：


{% highlight bash %}

gwen$ curl http://localhost:8083/connector-plugins

[{"class":"org.apache.kafka.connect.file.FileStreamSourceConnector"},
{"class":"org.apache.kafka.connect.file.FileStreamSinkConnector"}]

{% endhighlight %}

下面先来看下如何配置使用上面的connector，然后再讨论如何使用更高级的connector。

### FileStreamSourceConnector和FileStreamSinkConnector

在开始之前，请确认Zookeeper以及Kafka已经正常启动。

现在我们启动一个Connect节点（在线上环境你可能会启动多个）：

{% highlight bash %}

bin/connect-distributed.sh config/connect-distributed.properties &

{% endhighlight %}

然后启动文件源connector，并且配置其读取一个Kafka的配置文件，将文件内容写入一个Kafka主题：

{% highlight bash %}

echo '{"name":"load-kafka-config", "config":{"connector.class":"FileStream-
Source","file":"config/server.properties","topic":"kafka-config-topic"}}' |
curl -X POST -d @- http://localhost:8083/connectors --header "content-
Type:application/json"

{"name":"load-kafka-config","config":{"connector.class":"FileStream-
Source","file":"config/server.properties","topic":"kafka-config-
topic","name":"load-kafka-config"},"tasks":[]}

{% endhighlight %}

在上面创建connector的过程中，我们使用JSON来指明connector名称为load-kafka-config，并且指明connector类、源文件和写入的主题。

我们可以使用Kafka Console consumer来查看数据是否写入成功：

{% highlight bash %}

$ bin/kafka-console-consumer.sh --new --bootstrap-server=localhost:9092 --topic kafka-config-topic --from-beginning

{% endhighlight %}

如果一切正常，那么可以看到如下输出：

{% highlight text %}

{"schema":{"type":"string","optional":false},"payload":"# Licensed to the Apache Software Foundation (ASF) under one or more"}

<more stuff here>

{"schema":{"type":"string","optional":false},"pay-load":"############################# Server Basics #############################"}
{"schema":{"type":"string","optional":false},"payload":""}
{"schema":{"type":"string","optional":false},"payload":"# The id of the broker. This must be set to a unique integer for each broker."}
{"schema":{"type":"string","optional":false},"payload":"broker.id=0"}
{"schema":{"type":"string","optional":false},"payload":""}

<more stuff here>

{% endhighlight %}

这些其实就是config/server.properties的文件内容，里面的每一行都包装成JSON格式写入到kafka-config-topic主题中。JSONConverter默认在每一个记录中加入消息结构，这里的结构非常简单，只是一个名为payload类型为string的列，该列表示了文件的一行数据。

现在我们使用FileStreamSinkConnector来将主题中的数据转储成一个目标文件，该文件和源文件内容一样：

{% highlight bash %}

echo '{"name":"dump-kafka-config", "config":
{"connector.class":"FileStreamSink","file":"copy-of-server-
properties","topics":"kafka-config-topic"}}' | curl -X POST -d @- http://local-
host:8083/connectors --header "content-Type:application/json"

{"name":"dump-kafka-config","config":
{"connector.class":"FileStreamSink","file":"copy-of-server-
properties","topics":"kafka-config-topic","name":"dump-kafka-config"},"tasks":
[]}

{% endhighlight %}

这里和源connector不同的是：1）我们是用的是FileStreamSink而不是FileStreamSource; 2）文件属性指明的是目标文件地址而不是源文件地址；3）指明的是主题列表，而不是单个主题（这意味着我们可以将多个主题数据写入到一个文件，但源文件只能写入到一个主题）。

如果一切正常，我们将得到一个名为copy-of-server-properties的文件，文件内容与config/server.properties文件内容一样。

最后，我们可以通过下面API来删除一个connector：

{% highlight bash %}

curl -X DELETE http://localhost:8083/connectors/dump-kafka-config

{% endhighlight %}

如果以connector集群方式启动的话，那么其他connector会重启任务以进行剩余任务的重平衡。

### MySQL到Elasticsearch的connector样例


下面来看一个复杂点的例子：我们将一个MySQL的表数据发送到Kafka，然后从Kafka发送到Elasticsearch。

首先，我们需要安装MySQL和Elasticsearch。在MacOS上，我们可以使用brew来安装：

{% highlight bash %}

brew install mysql
brew install elasticsearch

{% endhighlight %}

然后获取MySQL和Elasticsearch的connector：

{% highlight text %}

1. 访问[https://github.com/con uentinc/ka a-connect-elasticsearch](https://github.com/con uentinc/ka a-connect-elasticsearch)
2. Clone该仓库
3. 运行mvn install进行编译
4. 使用相同步骤安装[JDBC connector](https://github.com/confluentinc/kafka-connect-jdbc)

{% endhighlight %}

将target目录下生成的jar包复制到Kafka Connect的类路径下：

{% highlight bash %}

$ mkdir libs
$ cp ../kafka-connect-jdbc/target/kafka-connect-jdbc-3.1.0-SNAPSHOT.jar libs/
$ cp ../kafka-connect-elasticsearch/target/kafka-connect-elasticsearch-3.2.0-SNAPSHOT-package/share/java/kafka-connect-elasticsearch/* libs/

{% endhighlight %}

如果Kafka Connect没有启动，那么需要将其启动，然后检查新的connector是否可用：

{% highlight bash %}

$  bin/connect-distributed.sh config/connect-distributed.properties &

$  curl http://localhost:8083/connector-plugins
[{"class":"org.apache.kafka.connect.file.FileStreamSourceConnector"},
{"class":"io.confluent.connect.elasticsearch.ElasticsearchSinkConnector"},
{"class":"org.apache.kafka.connect.file.FileStreamSinkConnector"},
{"class":"io.confluent.connect.jdbc.JdbcSourceConnector"}]

{% endhighlight %}

其中，JdbcSourceConnector需要依赖一个MySQL驱动来和MySQL交互，我们可以从Oracle下载MySQL的JDBC驱动，加压后将mysql-connector-java-5.1.40-bin.jar复制到Kafka connect的类路径下（也就是上面的libs/）。

下面我们先创建一张表（这张表的数据后续会被发送至Kafka）：

{% highlight bash %}

n$ mysql.server restart

mysql> create database test;
Query OK, 1 row affected (0.00 sec)

mysql> use test;
Database changed
mysql> create table login (username varchar(30), login_time datetime);
Query OK, 0 rows affected (0.02 sec)

mysql> insert into login values ('gwenshap', now());
Query OK, 1 row affected (0.01 sec)

mysql> insert into login values ('tpalino', now());
Query OK, 1 row affected (0.00 sec)

mysql> commit;
Query OK, 0 rows affected (0.01 sec)

{% endhighlight %}

可以看到，上面创建了一个数据库，然后创建一张表并写入了一些数据。

现在来看下如何配置JDBC source connector。我们可以通过如下API来获取配置属性的说明：

{% highlight bash %}

$ curl -X PUT -d "{}" localhost:8083/connector-plugins/JdbcSourceConnector/config/validate --header "content-Type:application/json" | python -m json.tool

{
    "configs": [
        {
            "definition": {
                "default_value": "",
                "dependents": [],
                "display_name": "Timestamp Column Name",
                "documentation": "The name of the timestamp column to use
                to detect new or modified rows. This column may not be
                nullable.",
                "group": "Mode",
                "importance": "MEDIUM",
                "name": "timestamp.column.name",
                "order": 3,
                "required": false,
                "type": "STRING",
                "width": "MEDIUM"
            },
            <more stuff>

{% endhighlight %}

上面发送了一个空的配置并验证，返回结果为所有可配置属性的定义说明。然后我们使用了Python来以友好的方式打印JSON。根据这些配置定义，我们现在可以创建及配置一个JDBC connector：

{% highlight bash %}

echo '{"name":"mysql-login-connector", "config":{"connector.class":"JdbcSource-
Connector","connection.url":"jdbc:mysql://127.0.0.1:3306/test?
user=root","mode":"timestamp","table.whitelist":"login","vali-
date.non.null":false,"timestamp.column.name":"login_time","topic.pre-
fix":"mysql."}}' | curl -X POST -d @- http://localhost:8083/connectors --header
"content-Type:application/json"

{"name":"mysql-login-connector","config":{"connector.class":"JdbcSourceConnec-
tor","connection.url":"jdbc:mysql://127.0.0.1:3306/test?
user=root","mode":"timestamp","table.whitelist":"login","validate.non.null":"fal
se","timestamp.column.name":"login_time","topic.prefix":"mysql.","name":"mysql-
login-connector"},"tasks":[]}

{% endhighlight %}

我们看下mysql.login主题中是否包含数据：

{% highlight bash %}

$ bin/kafka-console-consumer.sh --new --bootstrap-server=localhost:9092 --
topic mysql.login --from-beginning

<more stuff>

{"schema":{"type":"struct","fields":
[{"type":"string","optional":true,"field":"username"},
{"type":"int64","optional":true,"name":"org.apache.kafka.connect.data.Time-
stamp","version":1,"field":"login_time"}],"optional":false,"name":"login"},"pay-
load":{"username":"gwenshap","login_time":1476423962000}}
{"schema":{"type":"struct","fields":
[{"type":"string","optional":true,"field":"username"},
{"type":"int64","optional":true,"name":"org.apache.kafka.connect.data.Time-
stamp","version":1,"field":"login_time"}],"optional":false,"name":"login"},"pay-
load":{"username":"tpalino","login_time":1476423981000}}

{% endhighlight %}

如果主题不存在或者没有数据，那么我们可以检查Connect节点的日志，可能会发现一些异常信息，例如：

{% highlight text %}

[2016-10-16 19:39:40,482] ERROR Error while starting connector mysql-login-
connector (org.apache.kafka.connect.runtime.WorkerConnector:108)
org.apache.kafka.connect.errors.ConnectException: java.sql.SQLException: Access
denied for user 'root;'@'localhost' (using password: NO) at io.confluent.connect.jdbc.JdbcSourceConnector.start(JdbcSourceConnector.java:78)

{% endhighlight %}

（遇到异常不需要灰心丧气，在成功之前我们总需要尝试几次，这是非常正常的。）

如果connector正在运行，此时在数据表中新增记录，这些数据会立即写入mysql.login主题。

通过如上步骤，我们已经将MySQL的数据映射到Kafka的一个主题。下面我们将该主题映射到Elasticsearch。

首先，我们启动Elasticsearch：

{% highlight bash %}

$ elasticsearch &
$ curl http://localhost:9200/
{
  "name" : "Hammerhead",
  "cluster_name" : "elasticsearch_gwen",
  "cluster_uuid" : "42D5GrxOQFebf83DYgNl-g",
  "version" : {
    "number" : "2.4.1",
    "build_hash" : "c67dc32e24162035d18d6fe1e952c4cbcbe79d16",
    "build_timestamp" : "2016-09-27T18:57:55Z",
    "build_snapshot" : false,
    "lucene_version" : "5.5.2"
    },
    "tagline" : "You Know, for Search"
}

{% endhighlight %}

然后启动Elasticsearch的connector：

{% highlight bash %}

echo '{"name":"elastic-login-connector", "config":{"connector.class":"Elastic-
searchSinkConnector","connection.url":"http://localhost:
9200","type.name":"mysql-data","topics":"mysql.login","key.ignore":true}}' |
curl -X POST -d @- http://localhost:8083/connectors --header "content-
Type:application/json"

{"name":"elastic-login-connector","config":{"connector.class":"Elasticsearch-
SinkConnector","connection.url":"http://localhost:9200","type.name":"mysql-
data","topics":"mysql.login","key.ignore":"true","name":"elastic-login-
connector"},"tasks":[{"connector":"elastic-login-connector","task":0}]}

{% endhighlight %}


上面有几个配置需要解释下。connection.url指明Elasticsearch的服务器地址，Kafka中每个主题默认会映射成Elasticsearch的一个独立索引，索引名称默认与主题名称相同。我们需要对主题内的记录定义一个类型，这里定义为mysql-data。映射到Elasticsearch的主题为mysql.login。我们定义MySQL表时没有声明主键，因此Kafka中的消息key为null，这里需要指明Elasticsearch connector使用记录的主题、分区及位移信息来生成一个key。

如果一切正常，那么我们可以在Elasticsearch中搜索记录了：

{% highlight bash %}

gwen$ curl -s -X "GET" "http://localhost:9200/mysql.login/_search?pretty=true"
{
  "took" : 29,
  "timed_out" : false,
  "_shards" : {
    "total" : 5,
    "successful" : 5,
    "failed" : 0
   },
   "hits" : {
    "total" : 3,
    "max_score" : 1.0,
    "hits" : [ {
      "_index" : "mysql.login",
      "_type" : "mysql-data",
      "_id" : "mysql.login+0+1",
      "_score" : 1.0,
      "_source" : {
        "username" : "tpalino",
        "login_time" : 1476423981000
      } 
    }, {
      "_index" : "mysql.login",
      "_type" : "mysql-data",
      "_id" : "mysql.login+0+2",
      "_score" : 1.0,
      "_source" : {
        "username" : "nnarkede",
        "login_time" : 1476672246000
      } 
   }, {
      "_index" : "mysql.login",
      "_type" : "mysql-data",
      "_id" : "mysql.login+0+0",
      "_score" : 1.0,
      "_source" : {
       "username" : "gwenshap",
       "login_time" : 1476423962000
      } 
  } ]
 } 
}

{% endhighlight %}


如果我们再MySQL中新增记录，它们会自动被发送到mysql.login主题中，最后出现在Elasticsearch索引里面。

上面演示了如何使用Kafka connector将数据从MySQL转储到Elasticsearch，此外Confluent公司维护了其他[可用的connector](https://www.confluent.io/product/connectors/)，感兴趣的可以了解下。

### 深入了解Connect

在弄明白Connect工作原理之前，我们需要知道三个基本实体以及其交互。这三个实体分别是Connect节点、connector和convertor。下面来分别讨论下这几个实体。

**connector与task**

Connector插件实现了connector的API，它包含如下两部分：

* Connector：它负责三个重要的事情，1）决定需要运行多少task；2）将数据拷贝的任务分割到各个task中；3）生成task的配置以及分发。比如，JDBC源connector需要连接到数据库，基于库中的表来决定需要多少task（但task数不能超过max.tasks），然后为每个task生成一个配置，最后worker将会负责启动任务进行表的拷贝。需要提醒的是，当我们通过REST API来启动connector时，connector可以在任意节点上执行，而且后续的task也会在任意的节点上执行。
* task：task负责Kafka数据的输入或输出。所有的task都需要接收worker的上下文来进行初始化，源上下文包含一个允许任务存储源记录位移的对象（比如对于文件connector来说源记录位移就是字节偏移），目的上下文则需要包含允许connector控制接收Kafka记录的方法（用来做流量削峰、重试或者实现exactly-once语义）。task初始化之后，它们会按照connector创建的配置来启动。启动之后，源task将会从外部系统拉取数据并返回记录列表，然后worker发送至Kafka；目的task通过worker获取到Kafka的记录，并负责写入到另一个外部系统中。

**worker**

worker可以认为是执行connector和task的容器，它们负责处理定义connector配置的HTTP请求、存储connector配置、启动connector和任务、传递配置等工作。如果一个worker出现故障，集群内其他的worker会把故障worker的connector和task分配到其他worker执行；同样如果新增一个worker，集群也会将connector和task进行重平衡。除此之外，worker还会负责提交消息位移，并且在task发生错误时进行重试。

可以这么理解worker：connector和task负责“转移数据”，而worker负责REST API，配置管理，高可用和高可靠，横向扩展以及负载均衡。

**converter与数据模型**

Connect API包含了一个数据API，通过该数据API可以获取数据以及它的schema。源connector从数据源读取数据并生成value和Schema，而目的connector则使用该Schema处理value，然后将数据插入到目标系统。其中，converter负责将数据API生产出来的对象转换成Kafka中的数据结构，可以选择Avro、JSON或者字符串格式。因此当worker通过connector的数据API返回的记录时，它使用配置的Converter将其转换成相应格式并存储到Kafka中。而目的connector则刚好相反，worker从Kafka中读取数据（Avro、JSON或者字符串格式），使用配置的converter将其转换成数据API的记录格式，并传给目的connector，最后该connector插入到目标系统。


**位移管理**

worker自身会进行位移管理，这使得我们在开发时非常方便。位移管理的关键核心是，connector需要知道哪些是它们已经处理过的数据，并且可以使用Kafka提供的API来管理这些信息。

对于源connector来说，connector返回给worker的记录需要包含逻辑分区和逻辑位移。逻辑分区和逻辑位移不是Kafka中的分区和位移，而是源系统可能需要的分区和位移。比如，如果源头为文件，那么分区可以是一个文件，位移可以是行号；如果源头为数据库，那么分区可以是一张表，位移可以是表的主键ID。使用逻辑分区和逻辑位移的好处是，可以提高connector的并发度，并且会影响消息语义（at-least-once还是exactly-once）。

当源connector返回包含逻辑分区和逻辑位移的记录列表后，worker将这些记录发送至broker，如果成功则保存这些记录的位移（通常使用一个Kafka主题来保存，但可以更改）。这样使得connector在故障恢复后可以从最近存储的位移之后开始处理。

目的connector则从Kafka中读取记录，调用connector的put()方法来将这些记录存储至目标系统，如果成功则提交位移（和一般的消费者一样）。


## Kafka Connect的替代方案

### 其他数据存储系统的输入框架

目前除了Kafka还有其他一些数据存储系统，比如Hadoop、Elasticsearch。这些系统有它们相应的数据集成工具，比如Hadoop的Flume、Elasticsearch的Logstash或者Fluentd。如果Kafka是整个系统的核心并且有大量的输入源和目标系统，那么推荐使用Kafka Connect；而如果建立的是以Hadoop或者Elasticsearch为中心的系统，而Kafka只是其中一部分，那么使用Flume或者Logstash更合理一些。

### 基于GUI的ETL工具

像老的Infomatica、开源的Talend和Pentaho或者更新的Apache NiFi和StreamSets都支持将Kafka作为数据源或者目标系统。如果当前你已经大量使用这些技术方案，那么可以继续使用；而且基于GUI来搭建数据管道的话，这些方案也是比较合理的。但需要知道的是，如果你只是想输入数据到Kafka或者从Kafka中获取数据，这些方案通常都比较重，它们在消息传递上加了很多不必要的处理复杂度。

Kafka本身是一个能够做数据集成（通过Connect）、应用集成（通过生产者/消费者）和流式处理的平台，对于只是做数据集成的ETL来说，Kafka是一个可选的替代方案。

### 其他的流式处理框架

几乎所有的流式处理框架都支持从Kafka中读取数据并且写入到其他系统中。如果目标系统支持这些流式处理框架，并且你已经计划使用这些流式处理框架来处理Kafka的数据，那么使用这些框架来进一步做数据集成也是合情合理的，这可以节省工作流（因为如果只是写入和读取的话，根本不需要将数据存储到Kafka中）。但这有个缺点，那就是定位消息丢失或者消息错乱这些问题可能会比较麻烦。


