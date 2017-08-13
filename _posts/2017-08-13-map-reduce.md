---
layout: post
title: "MapReduce"
keywords: "分布式系统, map reduce"
description: "MapReduce读书笔记"
date: 2017-08-13 16:00
categories: "计算机科学, 分布式系统"
---

## 介绍

Google作为最大的互联网巨头（之一），内部有很多处理数据的需求，而且这些数据量往往都很大。例如，从爬取的海量网页中构建索引或者构建彼此间图形关系。由于数据量大，这些计算只能被分派给成百上千的机器进行并行计算。但这种并行计算在实现上比较复杂，面临很多问题，譬如如何实现并行、如何将数据分片、如何处理故障与失败等等。

基于这样的背景，Google设计了一个系统，提供了一个库，能够让使用者方便的实现计算逻辑，但又不用关心底层的并行、错误容忍、数据分片、负载均衡等复杂的逻辑。系统的关键抽象在于**map**和**reduce**，而这种思想来自于Lisp和其他函数式语言。map操作作用于原始的记录以产生中间key/value对，reduce则进一步对于相同的key进行value的聚合得到最终结果。

## 编程模型

通俗来说，MapReduce框架以key/value对作为输入，并最终转化成另外的key/value对作为输出。使用者需要实现map和reduce函数，map函数从原始的key/value中计算产生中间key/value，MapReduce框架根据相同的key做聚合，并传给reduce函数；reduce函数接收中间key以及相应的value集合作为输入，转化成最终的结果。在reduce函数中，value集合是以迭代器（iterator）方式提供的，防止value集合过大造成内存溢出。

### 样例

假如我们有海量的文本，现在需要计算在这些文本中每个单词出现的次数，那么map和reduce的伪代码如下所示：

{% highlight python %}
map(String key, String value):
	// key: document name
	// value: document contents
	for each word w in value:
		EmitIntermediate(w, "1");


reduce(String key, Iterator values):
	// key: a word
	// values: a list of counts
	int result = 0;
	for each v in values:
		result += ParseInt(v);
	Emit(AsString(result));

{% endhighlight %}


### 类型

虽然上面的伪代码用字符串类型作为输入/输出，但是map和reduce支持自定义类型：

* map (k1,v1) → list(k2,v2)
* reduce (k2,list(v2)) → list(v2)

最初输入的key/value类型和最终输出的key/value类型是相互独立的，而中间的key/value与最终的key/value类型是相同的。

### 其他例子

* 分布式的grep：map函数实现行的模式匹配，如果匹配则输出相应的行；reduce函数则只需要将中间结果直接输出；
* URL访问次数统计：map函数处理原始请求日志，输出（URL，1）；reduce函数聚合，输出（URL，total count）；
* 翻转网页连接关系：map函数对于source页面进行处理提取出target链接，并输出（target，source）；reduce函数对于source列表做拼接，输出（target，list(source)）
* 域名的关键词向量统计：关键词向量是统计在文档集合中最重要的词，形式如（word，frequency）；map函数从原始文档中计算得到（hostname, term vector），其中hostname根据文档的url提取；map函数对于相同的hostname做关键词向量聚合，得到最终的（hostname, term vector）；
* 分布式排序算法：map函数对于原始记录提取出key值，并组成（key, record）；reduce函数直接输出（key, record）。但这个过程需要依赖后面提到的分区（Partition）概念以及排序性质。

## MapReduce系统实现

Google使用大量相互连接的廉价PC作为MapReduce集群，细节如下：

1. 双核x86处理器，2-4GB内存，Linux系统；
2. 使用百兆或千兆网卡；
3. 集群由大量的机器组成，因此集群中机器故障会经常发生；
4. 使用廉价的IDE硬盘，使用[GFS](http://www.dengshenyu.com/%E8%AE%A1%E7%AE%97%E6%9C%BA%E7%A7%91%E5%AD%A6/2017/08/05/google-file-system.html)分布式文件系统；
5. 用户提交job到调度系统，而job包含多个task，由调度系统将task分派给机器执行

### 整体执行流程

MapReduce将输入数据分割成M个分片从而得到M个map任务，每个map任务可以被不同的机器并行处理；MapReduce将中间结果的key空间通过分区函数分割成R个分片（例如hash(key) mod R），从而得到R个任务。用户可以指定R的数量以及分区函数。

下图是MapReduce的整体流程图：

![mapreduce](/assets/mapreduce/map-reduce.png)

1. 用户程序依赖的MapReduce库将输入文件分成M个分片（16MB到64MB之间，可以由用户指定），然后用户程序被分派给集群中多台机器；
2. 其中一台机器比较特殊，它是master。其余的机器则是worker，由master分派工作任务。一个用户的job由M个map任务以及R个reduce任务组成，由master挑选空闲机器处理map任务或者reduce任务；
3. 被分派map任务的worker从相应的输入文件分片中读取数据，提取出原始的key/value并传给map函数，map函数计算得到中间key/value并缓存在内存中；
4. 内存中的中间结果会保存在本地磁盘中，并通过分区函数分成R个区域。map任务处理完后，本地磁盘的中间结果的位置信息会通知给master，由master将这些位置信息通知给reduce；
5. reduce收到master通知后，通过远程方法调用从map任务的worker上读取中间结果数据；当reduce读取完所有map任务的中间数据，它会根据中间结果的key做排序，以便相同key的数据放在一起。这个排序是必要的，因为通常多个key的数据会被一个reduce任务处理。如果中间结果数据量太大，那么会使用外部排序；
6. reduce遍历有序的中间结果数据，对于不同的中间结果key，它将这个key以及其value集合传给reduce函数；reduce函数的输出会被追加到这个reduce任务对应的最终结果文件中；
7. 当所有的map和reduce任务处理完后，master唤醒用户程序，控制权交还给用户程序。

MapReduce完成后，用户可以通过R个reduce结果文件获取最终结果；通常来说，用户没有必要聚合这R个文件成为一个文件，因为他们会继续通过别的MapReduce进行再加工。

### Master的数据结构

master保存多个数据结构。

* 对于每个map和reduce任务，它都会存储其状态（等待、处理中、已完成）以及相应的worker信息。
* 由于master是map和reduce的中间桥梁，因此对于每个已完成的map任务，master需要存储map产生的R个分块的位置与大小信息，并通知正在进行的reduce任务。

### 容错性

#### worker故障

master定期ping集群中的worker机器，如果在特定时间内没有收到回复，master便认为该worker存在故障。该worker处理的任何已完成的map任务会回滚到待处理状态，重新被调度执行；而该worker正在处理的map或reduce任务也会被master回滚到待处理状态，重新被调度执行。

该worker已完成的map任务需要被重新执行是因为它的输出数据存放在本地磁盘上，而已完成的reduce任务不需要重新执行是因为其输出数据存放在分布式文件系统上。

当一个map任务先被worker A执行后被worker B执行（由于A故障），所有执行reduce任务的worker都会被通知，而任何没有从worker A读取数据的reduce任务会从worker B读取。

MapReduce框架能够在大量worker故障的情况下仍然保持可用。假设在一次job执行过程中，由于网络隔离导致80台机器不可连接，master只需要重新执行这些worker的任务即可。

#### master故障

定期将master中的任务数据生成检查点是很容易的事情，这样的话如果master宕机了，一个新的master可以在最新的检查点基础上启动。但是，因为master只有一个，出现故障的概率是很低的，因此在master故障的情况下集群直接停止MapReduce计算，client可以通过检查状态并且重试任务。


#### 失败故障及语义保障

如果用户实现的map和reduce算子能够得到确定性的结果，那么无论在执行过程中是否存在故障失败，最终的结果都是确定的。这个性质依赖于map和reduce任务的原子性提交。任何正在处理的任务都会写到临时文件中，map写到R个文件中，reduce写到最终一个文件中。当map任务完成后，worker会发送消息通知master，并告知其R个临时文件的位置及名称，如果master第一次收到该消息则记录其数据，否则忽略；当reduce任务完成后，该worker原子性的将该临时文件重命名成最终结果文件（这里需要原子性是因为如果多个worker执行相同的reduce任务，那么可能会造成并发冲突），重命名的原子性由底层的分布式文件系统提供。

### 本地化

在MapReduce集群中，网络带宽是一个相对稀缺的资源。MapReduce通过在GFS系统上直接构建集群来节省网络带宽；GFS将文件分割成64MB的块，并且每个块冗余几个副本（通常为3个），存放在不同的机器上；MapReduce的master会考虑这些文件的位置信息，尽可能在输入文件的数据副本机器上进行map任务处理，或者在这些副本的附近机器（例如在相同的交换机内）上进行map处理。

通过这样的处理，很多输入数据能够在本地读取以及处理，不消耗网络带宽。

### 任务粒度

如前所述，map过程被分成M个任务，reduce过程被分成R个任务，通常来说M和R需要比worker的数量要大得多。因为切割成这样的小任务可以得到更好的负载均衡，同时也能加速失败任务的重新执行速度。

但实际上对于M和R的取值大小也有约束，因为master需要作出O(M + R)个调度决策，并且在内存中保持O(M * R)种状态数据（但是常量因子很小，状态数据大小通常为1个字节左右）。另外，用户也会约束R，因为最终结果文件数也和R的值一样。


综上，在map阶段每个任务输入数据通常大概在16MB到64MB左右（如前所述这样的策略能有最高效的本地传输优化），而R的值通常是worker数量的若干倍。Google中一般的经验值为，对于有2000个worker，M一般为200000，R为5000。

### 备份任务

在MapReduce中，拖长整个执行时间的原因之一是掉队者现象：在map或者reduce计算的最后阶段，一台机器花费了非常长的时间去计算。掉队者现象的出现有很多原因，譬如读写磁盘校正数据导致30MB/s的读写速率下降到1MB/s、其他的Map/Reduce任务影响机器性能等等。

Google的解决方案是，如果map或者reduce阶段快要完成了，对于还在进行中的任务，master会进行任务备份（也就是说将这些任务另外再分派其他worker处理）。无论原始任务还是备份任务处理完毕，master都认为这个任务完成了。当然这个机制需要调优，以不占用太多的额外计算资源。

## 优化

通常来说，简单的map和reduce可以满足大部分的需求了，但是MapReduce框架还有一些其他功能非常有用。

### 分区函数

在MapReduce中，用户需要指定reduce任务数（也是最终结果文件数），而数据分区是基于中间数据的key得到的。默认的分区函数是哈希取模（也就是hash(key) mod R），这样可以得到最好的负载均衡。但在某些场景下，使用其他的分区函数更好，譬如原始输入的key是url，而我们希望最终输出文件中同样host的url只出现在一个文件中。对于这样的场景，我们可以自定义分区函数，例如定义为“hash(Hostname(urlkey)) mod R”。

### 顺序保证

MapReduce保证对于相同的分区，中间结果的key/value在被reduce处理时是以key递增的顺序来处理的。这种顺序保证使得对于相同的分区产生最终有序的结果非常容易。

### combiner函数

在某些场景下，map任务的处理结果中存在大量重复的key。例如前面说的单词总数计算例子，每个map任务可能会产生成千上万的相同的中间key/value对（例如可能包含上万个(the, 1)），而这些中间key/value对需要通过网络传输到某台reduce机器上进行汇总，最终得到一个总数。

对于这样的场景，用户可以指定combiner函数，以在数据传输前进行部分的数据聚合。combiner函数在执行map任务的机器上运行，而且通常来说combiner的代码和reduce的代码是一样的，区别仅仅在于reduce函数的输出是写到最终结果文件，而combiner的输出是写到中间文件并且最终被reduce处理。

### 输入与输出类型

MapReduce支持多种格式的输入数据。例如，在“text”模式下，每一行被当做key/value：key是行的在文件内的偏移，value是行的数据。另一种常见的模式是，输入数据是以key排序的key/value，而且这种类型实现包含了如何切割成map任务块的信息。用户可以通过实现reader接口来得到新的输入类型。一个reader不一定要从文件中读取数据，它也可以从其他地方（譬如数据库）读取数据。

同样的，MapReduce也预定义了多种输出格式，用户也可以自己定义新的输出类型。

### 额外输出

在某些场景下，用户可能会在map或者reduce任务中自己产生额外的数据输出。对于这样的场景，用户需要自己保证这些额外的输出是原子性和幂等的。一般来说，用户会写到一个临时文件，在完成后将临时文件通过原子性的重命名得到结果文件。

对于一个任务产生多个文件来说，MapReduce不支持两阶段的提交。但这种限制在实际上不会成为问题。

### 忽略坏记录

在某些时候，用户的代码bug导致map或reduce任务对于某些特定记录会crash，这样的bug会导致整个MapReduce过程失败。通常遇到这种情况，用户会选择修复bug，然后重新运行提交job，但有些时候这是不可行的。例如，如果bug是出现在第三方的库中，而源码并不能修改。而且，有时候忽略一小部分的记录是允许的，例如对于一个海量数据集进行数据分析。

MapReduce提供一种可选的机制来检测哪些记录会导致crash，然后在处理中跳过这些记录以完成整个处理。每个worker进程都有一个signal handler，它会负责捕捉段异常和bug异常。如果用户代码产生一个异常信息，signal handler会将这个记录的异常信息通过UDP的方式发送给master；master收到不止一个相同记录的异常信息后，在下一次任务重新处理时会跳过这样的记录。

### 本地执行

在MapReduce中对map函数或者reduce函数进行debug是比较困难的，因为这些任务是被master动态分派给集群内多台机器（可能有上千台机器）执行。为了方便debug和小规模测试，MapReduce支持所有的任务都在提交任务的本地机器上执行，用户有足够的控制权来debug或者测试。

### 状态信息

master内部运行一个HTTP的服务，并且提供可供阅读的状态页面。这些状态页面展示了计算的过程（例如多少个任务已完成、多少个任务正在进行中、处理速率等等），同时也包含了每个任务的标准输出和错误信息。用户可以使用这些数据来判断计算需要的时间，或者判断是否需要加机器等等。另外，顶层的状态页面展示了哪些worker运行失败，以及哪些map、reduce任务处理失败，这些信息对于诊断代码bug非常有用。

### 事件统计

最后，MapReduce还提供事件统计的功能。例如，用户可能想统计处理的单词个数。

用户可以创建一个命名的统计对象，在map、reduce方法中进行数据递增统计。例如：

{% highlight python %}

Counter* uppercase;
uppercase = GetCounter("uppercase");

map(String name, String contents):
	for each word w in contents:
		if (IsCapitalized(w)):
			uppercase->Increment();
		EmitIntermediate(w, "1");

{% endhighlight %}

worker上的统计数据会定期同步给master，master聚合成功任务的统计数据，并在MapReduce完成后返回给用户。另外，master的状态页面上也实时展示当前收集到的统计数据，用户可以观测到实时计算进度。在聚合统计数据时，master会对相同的map或reduce任务的统计数据进行去重。


