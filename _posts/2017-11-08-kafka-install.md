---
layout: post
title: "Kafka系列（二）--搭建Kafka"
keywords: "Kafka，分布式系统"
description: "Kafka系列（二）--搭建Kafka"
date: 2017-11-08 23:00
categories: ["分布式系统"]
---

> 本系列文章为对《Kafka：The Definitive Guide》的学习整理，希望能够帮助到大家

## 在搭建Kafka之前

在使用Kafka之前，我们需要准备Kafka依赖的环境。

### 操作系统

Kafka是基于Java开发的，因此可以运行在所有的操作系统上，只要有Java运行环境即可。下面章节会以Linux系统作为背景，因为Linux是目前Kafka主要应用的操作系统。

### Java环境

在安装Zookeeper或者Kafka之前，你需要安装并设置Java环境，建议使用Java 8版本。虽然Zookeeper或Kafka只需要Java运行环境即可，但建议在开发中使用完整的Java开发环境JDK，这样更方便。下面假设Java路径为/usr/java/ jdk1.8.0_51（注意，这可能和你的不同）。

### 安装Zookeeper

Kafka使用Zookeeper来存储集群元数据以及消费者元数据，如下所示：

![zookeeper](/assets/kafka-install/zookeeper.png)

在本书（译者：也就是《Kafka：The Definitive Guide》）完成时，Kafka已经测试通过Zookeeper的3.4.6稳定版，推荐使用该版本的Zookeeper。

**单机版Zookeeper**

下面将Zookeeper安装在/usr/local/zookeeper中，并设置简单的配置，存储数据到/var/lib/zookeeper中：

{% highlight bash %}

# tar -zxf zookeeper-3.4.6.tar.gz
# mv zookeeper-3.4.6 /usr/local/zookeeper
# mkdir -p /var/lib/zookeeper
# cat > /usr/local/zookeeper/conf/zoo.cfg << EOF
> tickTime=2000
> dataDir=/var/lib/zookeeper
> clientPort=2181
> EOF
# export JAVA_HOME=/usr/java/ jdk1.8.0_51
# /usr/local/zookeeper/bin/zkServer.sh start
JMX enabled by default
Using config: /usr/local/zookeeper/bin/../conf/zoo.cfg
Starting zookeeper ... STARTED
#

{% endhighlight %}


可以通过连接并发送srvr命令来确认Zookeeper已经启动：

{% highlight bash %}

# telnet localhost 2181
Trying ::1...
Connected to localhost.
Escape character is '^]'.
srvr
Zookeeper version: 3.4.6-1569965, built on 02/20/2014 09:09 GMT
Latency min/avg/max: 0/0/0
Received: 1
Sent: 0
Connections: 1
Outstanding: 0
Zxid: 0x0
Mode: standalone
Node count: 4
Connection closed by foreign host.

{% endhighlight %}

**Zookeeper集群**

Zookeeper集群的机器数一般都是奇数的（3、5等等），拥有3个节点的Zookeeper集群可以容忍1个节点故障，5个节点的集群可以容忍2个节点故障。关于Zookeeper集群节点数，推荐使用5个节点，只是因为当需要更改集群配置时可以一次重启一台机器而不干扰集群正常运行；不推荐使用超过7个节点的Zookeeper集群，因为一致性协议会导致集群性能下降。

配置Zookeeper集群时，配置中需要指出集群的所有机器，同时每台机器需要在data目录中包含一个myid文件来指明该机器的ID。下面是一个配置例子，其中集群机器分别为zoo1.example.com，zoo2.example.com，zoo3.example.com：

{% highlight xml %}

tickTime=2000
dataDir=/var/lib/zookeeper
clientPort=2181
initLimit=20
syncLimit=5
server.1=zoo1.example.com:2888:3888
server.2=zoo2.example.com:2888:3888
server.3=zoo3.example.com:2888:3888

{% endhighlight %}

其中，initLimit是限制跟随者初始连接到群首的时间，syncLimt是限制跟随者落后于群首的时间跨度，这两个值都是以tickTime为单位的，例子中的initLimit为20 * 2000毫秒，也就是40秒。配置中也指明了集群机器的情况，机器的格式为server.X=hostname:peerPort:leaderPort，其中：

* X：机器的ID，整数值；
* hostname：机器的域名或IP；
* peerPort：集群中机器相互通信的端口；
* leaderPort：群首选举的端口；

## 安装一个Kafka broker

安装完Java和Zookeeper之后，我们可以安装Kaka了。在本书完成时，Kafka版本为0.9.0.1（其中Scala版本为2.11.0）。下面将Kafka安装在/usr/local/kafka，并使用之前的Zookeeper，保存日志到/tmp/kafka-logs中：

{% highlight bash %}

# tar -zxf kafka_2.11-0.9.0.1.tgz
# mv kafka_2.11-0.9.0.1	/usr/local/kafka
# mkdir /tmp/kafka-logs
# export JAVA_HOME=/usr/java/jdk1.8.0_51
# /usr/local/kafka/bin/kafka-server-start.sh -daemon /usr/local/kafka/config/server.properties
#

{% endhighlight %}

启动后，我们可以通过一些简单的操作来确认是否正常。

创建并验证一个主题：

{% highlight bash %}

# /usr/local/kafka/bin/kafka-topics.sh --create --zookeeper localhost:2181 --replication-factor 1 --partition 1 --topic test
Created topic "test".
# /usr/local/kafka/bin/kafka-topics.sh --zookeeper localhost:2181 --describe --topic test
Topic:test    PartitionCount:1    ReplicationFactor:1    Configs:
    Topic: test    Partition: 0    Leader: 0    Replicas: 0    Isr: 0

{% endhighlight %}

生产者发送消息到test主题：

{% highlight bash %}

# /usr/local/kafka/bin/kafka-console-producer.sh --broker-list localhost:9092 --topic test
Test Message 1
Test Message 2
^D
#

{% endhighlight %}

消费者从test主题读取消息：

{% highlight bash %}

# /usr/local/kafka/bin/kafka-console-consumer.sh --zookeeper localhost:2181 --topic test --from-beginning
Test Message 1
Test Message 2
^C
Consumed 2 messages

{% endhighlight %}

## broker配置

上面的配置用来运行单机的Kafka已经足够了。Kafka中有很多参数可以调优，但大部分都可以使用默认参数，除非你有特殊的场景需求。

### 基本配置

当以集群形式来运行Kafka时有一些参数需要重新考虑，这些参数是Kafka的基本参数，如果以集群形式部署大部分需要做些修改。

**broker.id**

每个Kafka broker都需要有一个整数标识，默认为0，但可以是任意值。需要注意的是，集群内broker的id必须不同。

**port**

Kaka的监听端口。上面例子中使用9092作为监听端口，但可以修改成任意值。

**zookeeper.connect**

Zookeeper连接的地址，例子中使用localhost的2181端口连接。但这个参数的完整格式是以逗号分隔的hostname:port/path字符串，其中：

* hostname：Zookeeper的域名或IP地址；
* port：Zookeeper的连接端口；
* /path：Kafka的工作根目录，可选参数。

**log.dirs**

Kafka将消息持久化到磁盘，存放在这个参数指定的路径下。这个参数可以是逗号分隔的多个路径，如果指定超过1个路径，那么Kafka会基于最少使用的原则来实现分区日志均衡，但前提是同一个分区的日志放在相同的路径下。

**num.recovery.threads.per.data.dir**

Kafka使用一个线程池来处理目录的日志，这个线程池会用在：

* 当成功启动时，用来打开每个分区的日志；
* 当从故障恢复时，检查和恢复分区日志；
* 当关闭时，优雅关闭日志。

由于这个线程池只是在启动或关闭时使用，因此可以适当设置大一点。尤其是从故障恢复时，对于有大量日志的broker来说大的线程池可以并行处理，可以节省几个小时的时间！这个参数设置的是每个目录的线程数，因此总线程数与log.dirs有关。举个例子，假如设置num.recovery.threads.per.data.dir为8，log.dirs为3，那么总线程数量为24。

**auto.create.topics.enable**

这个参数默认为true，指明broker在如下场景会自动创建主题：

* 生产者开始写消息到这个主题时；
* 消费者开始从这个主题读消息时；
* 当任何客户端查询这个主题的元信息时。

但在很多场景下这个特性可能并不需要，那么可以手动将这个参数设置为false。

### 默认主题参数

Kafka服务器配置指定了主题创建时的默认参数，当然我们也可以通过管理工具为每个主题来设置个性化参数值来覆盖默认值。下面来看看这些默认参数。

**num.partitions**

num.partitions参数决定了主题创建时的分区数，默认为1个分区。需要注意的是，主题的分区数只能增加而不能减少。分区机制使得主题可以均衡分布在Kafka集群，许多用户往往设置分区数等于broker数或者是broker数的几倍。下面是一些设置分区数的考虑因素：

* 你希望主题的吞吐量是多少？
* 你希望单个分区的吞吐量是多少？举个例子，假如消费者从分区读取消息写入数据库，而写入数据库上限为50MB/s，那么分区的上限可以限定在60MB/s。
* 可以适当考虑生产者写入单个分区的速率。不过由于写入速度往往比读取处理速度快，因此瓶颈往往在读取并处理消息上。
* 如果写入时是基于键值来决定分区的，那么应该考虑以后的量级而不仅仅当前的量级，因为扩容起来比较麻烦。
* 考虑每个broker的分区数、磁盘容量和带宽。
* 避免过度设计，因为更多的分区数会增加broker的内存和其他资源消耗，也增加群首选举的时间。

如果我们得出主题的预期吞吐以及分区的预期吞吐，那么可以得出分区数。举个例子，假如预期主题的吞吐为读写速率为1GB/s，而每个消费者的处理速度为50MB/s，那么至少需要20个分区。

**log.segment.bytes**

当写入消息时，消息会被追加到日志段文件中。如果日志段超过log.segment.bytes指定大小（默认为1G），那么会打开日志段进行追加。旧日志段关闭后，超过了一定时间会被过期删除。如果主题的写入速度很慢，那么这个参数最好做些调整。假如一个主题一天只有100MB的数据写入，假如log.segment.bytes默认1G，那么一个日志段需要10天才能写满并关闭；如果过期策略设置为604800000（也就是7天），那么一个日志段需要17天才能被删除。因为一个日志段需要10天写满，然后这个日志段需要等待7天才能保证它包含的所有消息过期。

**log.segment.ms**

这个参数也可以控制日志段文件的关闭，一旦设置，当日志段到达这个参数设置的时间限制，日志段会被关闭。此参数默认没有设置，也就是日志段只根据大小来关闭。

当使用log.segment.ms参数时，有一个场景需要注意，那就是如果有大量的分区而这些分区的日志段都没有到达指定大小，那么达到log.segment.ms时间时，这些分区的日志段会同时被关闭，可能会影响磁盘性能。

**message.max.bytes**

Kafka broker通过这个参数来限制消息大小，当生产者发送的消息超过这个大小时，发送消息会失败。注意这个参数限制的是发送者发送到broker的消息大小，如果发送前消息超过此阈值，但是压缩后消息小于此阈值，那么发送仍然会成功。

这个值默认为1M，我们可以调整这个值，但需要注意的是更大的消息会导致broker处理消息以及持久化消息性能下降。另外，Kafka中有另外一个参数fetch.message.max.bytes来限制消费者获取的消息大小，fetch.message.max.bytes小于message.max.bytes，那么可能会导致消费者无法消费消息而被卡住。


## 硬件考虑因素

选择硬件是技术，但更是艺术。Kafka本身不要求硬件，但是如果追求极致的性能，那么有几个因素需要考虑：磁盘吞吐及容量、内存、CPU、网络带宽等等。在实际情况中，我们需要考虑哪部分是瓶颈，然后根据预算重点优化。

### 磁盘吞吐

这个指标直接影响到生产者写入消息的性能。生产消息时，消息需要至少在一个broker上持久化，这样消费者才能读取。磁盘写入越快，写入延迟越小。

对于磁盘，一般会从传统磁盘与固态硬盘（solid-state disk）中选择。固态硬盘性能最好，而传统磁盘则更加便宜、容量更大。如果使用传统磁盘，我们可以对一个broker挂载多个磁盘，或者对于磁盘使用RAID来进行加速。

### 磁盘容量

磁盘容量需要根据保留的消息量得出。如果一个broker期望每天可写入1TB消息，而消息持久化策略为7天，那么1个broker需要至少7TB的磁盘容量。另外，最好考虑10%的额外容量来存储其他文件或者留点buffer。

当评估Kafka集群大小以及判断何时需要扩容时，磁盘容量是一个重要的参考因素。当评估Kafka集群容量或者考虑扩容时，磁盘容量是一个重要的参考因素。对于一个Kafka集群，我们可以设置一个主题多个分区，这样当一个broker磁盘不足时，我们可以通过增加broker并分配分区来解决问题。另外，磁盘容量也受集群的冗余（replication）策略影响。

### 内存

通常来说，消费者消费速度与生产者生产速度相当，也就是说消费者从分区末尾读取。在这种情况下，如果消费者可以从系统的页缓存（page cache）读取而不是磁盘，那么消费性能可以大大提升。因此，内存越大，能够用来做页缓存（page cache）的容量也就越多，消费者的性能越好。

Kafka本身不需要配置太多的JVM内存，一般5GB的堆就足够了。另外，不建议Kafka与其他应用同时部署，因为其他应用会分享系统的页缓存而导致Kafka消费性能下降。

### 网络带宽

当评估集群容量时，网络带宽也是一个重要的参考因素，网络带宽评估会稍微复杂点。首先，网络带宽分为inbound带宽与outbound带宽，如果一个生产者以1MB/s速度写入，但可能有多个消费者，那么outbound带宽可能是inbound的数倍。另外，集群的复制和镜像也会导致outbound带宽上升。网络带宽需要慎重考虑，否则可能会导致集群的复制落后，从而导致集群状态不稳定。

### CPU

相对于磁盘与内存来说，CPU不是一个重要的考虑因素。在消息压缩的场景下，Kafka broker需要对于批量消息进行解压缩，然后验证校验和（checksum）以及赋予消息位移（offset），最后再压缩消息写入磁盘。这是CPU占用最多的地方。再提醒下，在选择硬件时，CPU不是一个主要的考虑因素。

## 云上的Kafka

Kafka部署在云上的情况非常常见，例如AWS（Amazon Web Service）。AWS通常提供CPU、内存与磁盘的各种组合，当我们选择机器时，可以先考虑磁盘容量与生产者生产消息的速率。如果需要追求低延迟，那么SSD可能更优，否则临时性存储（例如AWS Elastic Block Store）可能就足够了。做出选择后，我们可以进一步考虑内存和CPU。

## Kafka集群

单机版的Kafka对于开发已经足够了，但如果在线上环境，我们通常以集群形态部署。下图是一个集群的例子：

![cluster](/assets/kafka-install/cluster.png)

使用集群最大的好处是，我们可以使用多个机器来负载均衡；而且，集群使用复制（replication）可以避免由于机器宕机而导致数据丢失，同时我们也可以对broker进行机器运维。

### 我们需要多少个broker？

在评估集群broker数量时，第一个需要考虑的是集群的磁盘容量与单个broker的磁盘容量。如果集群期望保留10TB的数据，而单个broker可以存储2TB，那么我们需要5个broker。另外，使用复制的话会导致磁盘容量至少上升100%（准确的数字根据复制策略来判断），这意味着我们至少需要10个broker。

然后，我们需要考虑集群处理请求的速度。我们需要知道网络带宽是多少？是否能支持多个消费者？举个例子，如果在只有一个消费者的前提下，broker的网络带宽已经占用70%，那么增加一个消费者会导致这两个消费者不能及时消费消息，除非我们再增加一个broker。如果集群使用复制的话，那么相当于再增加一个数据消费者。磁盘读写速率与机器内存大小也会影响请求处理速度，因此实际情况中由于这两个因素而扩容的例子也不少。

### broker配置

对于broker来说，加入Kafka集群的参数配置只有两项：

* zookeeper.connect：这个参数指定集群存储元数据的zookeeper集群。
* broker.id：在相同Kafka集群内，broker.id不能相同

### 系统调优

对于Linux来说，大部分发行版的默认参数已经能满足需求了，但如果想追求极致性能，我们可以重点关注虚拟内存（virtual memory）和网络子系统（network subsystem），这两个参数一般可以在/etc/sysctl.conf文件中配置。

**虚拟内存**

一般来说，Linux系统会根据系统负载来自动调整虚拟内存，但在Kafka的使用场景下，我们可以适当调整交换空间（swap space）和内存脏页（dirty memory page）的处理策略。

处于性能考虑，大部分应用（尤其是高吞吐应用）会尽可能避免系统交换（swapping），Kafka也不例外。一种避免交换的方法是，不配置交换空间。使用交换空间不是必须的，它只是避免了在内存不足的情况下系统杀死进程而已。我们可以设置vm.swappiness为一个非常小的值（例如1），通过这个参数我们可以控制操作系统倾向于减少页缓存，而不是使用swap。为什么不设置为1？以前这个值通常设置为0，意味着“不使用swap，除非内存不足”；但后来部分Linux发行版的内核修改了含义，变成了“任何情况下都不使用swap”。因此这里建议设置为1。

另外，我们也可以调整操作系统刷新脏页到磁盘的策略。首先，我们可以降低操作系统后台刷新脏页到磁盘的阈值。这个由vm.dirty_background_ratio来控制，默认为10，表示为脏页与总内存容量的比例。我们可以将其调整为5，这个调整通常不会有太大问题，因此Kafka一般使用SSD或者其他磁盘I/O优化方案（例如RAID），磁盘I/O速度非常快。但不应该设置成0，这样内核会一直刷新脏页。然后，我们可以把写入而导致同步刷新的阈值调高，这个值由vm.dirty_ratio控制，默认为20，同样表示为脏页与总内存容量的比例。将vm.dirty_ratio调整到60到80是一个可以考虑的方案。调大vm.dirty_ratio有两个比较小的风险，一个是脏页增多导致宕机数据损失可能性增加，另外则是一旦触发同步刷新，I/O停顿增加。对于宕机数据损失，我们可以使用集群复制策略来避免。

在调整完参数后，我们可以通过/proc/vmstat来观察系统在高负载情况下脏页的数量：

{% highlight bash %}

# cat /proc/vmstat | egrep "dirty|writeback"
nr_dirty 3875
nr_writeback 29
nr_writeback_temp 0
#

{% endhighlight %}

**磁盘**

在优化磁盘I/O时，选择完磁盘硬件之后，磁盘的文件系统也是一个重要的考虑因素。通常，我们使用EXT4（Fourth Extended File System）或者XFS（Extents File System）。其中，XFS成为了很多Linux发行版的文件系统，原因在于它性能优于EXT4而且不需要特别的参数调优。

但无论是选择哪个文件系统，建议在挂载磁盘时设置noatime。Linux中文件的元数据包含ctime（创建时间）、mtime（最近修改时间）和atime（最近访问时间），而在Kafka的使用场景下，atime是没有用到的，但每次读取时却要触发磁盘写入。

**网络**

调整Linux的网络栈对于高吞吐的应用来说是非常常见的，下面来看下一些常见的参数调优。

第一个调整socket的接收和发送缓冲区，通过调大这两个缓冲区，我们可以提高大量数据传输的性能。首先，net.core.wmem_default和net.core.rmem_default是socket读/写的默认大小，我们可以调整为131072，也就是128K；然后net.core.wmem_max和net.core.rmem_max是socket读/写缓冲区的最大值，我们可以调整为2097152，也就是2M。对于TCP的socket来说，我们需要额外设置两个参数，它们是net.ipv4.tcp_wmem和net.ipv4.tcp_rmem，这两个参数的值都是以空格分隔的三个整数，分别是最小、默认和最大值。其中，最大值不能超过net.core.wmem_max和net.core.rmem_max指定的值。我们可以将这两个TCP socket参数设置为“4096 65536 2048000”，也就是最小4K、默认64K、最大2M。

还有其他的一些网络参数可以调优：

* 设置net.ipv4.tcp_window_scaling为1，这样可以使得传输数据更有效率，并在broker侧缓存数据；
* 调大net.ipv4.tcp_max_syn_backlog（默认为1024），这样可以允许更多并发连接等待被接受（accept）；
* 调大net.core.netdev_max_backlog（默认为1000），这样可以允许在流量高峰时更多数据包在内核中排队等待处理。

## 线上考虑因素

当Kafka上线时，有一些额外因素需要考虑。

### 垃圾收集参数

对JVM垃圾收集参数调优，往往需要从应用本身特点出发，需要长时间的观察、修改参数并观察验证。有了G1垃圾收集器（Garbage first），垃圾收集参数调优工作简单了很多。G1会根据负载情况自适应，并在应用声明周期内提供始终一致的GC停顿时间，其实现内部会将整个堆分成多个区域，这样在垃圾收集时不需要对整个堆进行垃圾收集。

下面是G1两个比较重要的参数：

* MaxGCPauseMills：指定垃圾回收的最大停顿时间，默认为200ms。G1会尽可能在保证垃圾回收时不超过这个阈值，但是在需要的情况下停顿时间会超过这个时间。
* InitiatingHeapOccupancyPercent：指定多大的堆使用比例会触发垃圾收集，默认为45%。

Kafka本身使用内存非常高效，因此我们可以将这两个参数设置得更小。在64G机器内存，5G的Kafka内存情况下，我们可以设置MaxGCPauseMills为20ms，InitiatingHeapOccupancyPercent为35。

当前的Kafka启动脚本使用的是CMS垃圾收集器，我们可以修改使用G1：

{% highlight bash %}

# export JAVA_HOME=/usr/java/jdk1.8.0_51
# export KAFKA_JVM_PERFORMANCE_OPTS="-server -XX:+UseG1GC -XX:MaxGCPauseMills=20 -XX:InitiatingHeapOccupancyPercent=35 -XX:DisableExplicitGC -Djava.awt.headless=true"
# # /usr/local/kafka/bin/kafka-server-start.sh -daemon /usr/local/kafka/config/server.properties
#

{% endhighlight %}

### 集群的机器分布

Kafka在分配分区到不同的broker时并没有考虑机架、网络远近等因素，因此很可能将一个分区的所有副本都分配到同一个机架上，这样当这个机架断电或故障时，这个分区就会丢失。因此最佳实践是，集群的broker都分布在不同的机架上，至少不共用一个单点基础设施（例如电源、交换机等等）。

### Zookeeper

Kafka使用Zookeeper存储broker、主题及分区等集群元信息，而这些信息极少修改，因此Kafka与Zookeeper通信也很少。在实际情况中，往往有多个Kafka集群都使用同一个Zookeeper集群。

但是，对于消费者与Zookeeper来说，则不然。消费者在读取消息时，需要不断提交消费位移，而这个数据可以存放在Zookeeper或者Kafka中。对于拥有大量消费者的Kafka集群来说，如果使用Zookeeper来存储消费位移，那么会对Zookeeper造成相当大的压力。我们可以调整提交位移的间隔（例如设置为1分钟）来减轻Zookeeper的压力，但最好是使用Kafka来存储位移信息。

另外，Kafka依赖的Zookeeper集群不应该向其他应用来提供服务，因为这样容易因为其他应用的原因而导致Kafka集群不可用。



