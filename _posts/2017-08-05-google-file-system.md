---
layout: post
title: "Google File System"
keywords: "分布式系统, gfs"
description: "google file system读书笔记"
date: 2017-08-05 18:00
categories: "计算机科学"
---

## 介绍

随着Google日益增长的数据处理需求，Google研发了自己的分布式存储系统--Google File System（GFS）。GFS参考了其他分布式系统的设计，同时也结合了自身需要，提出了如下几点和传统分布式系统不一样的设计理念：

1. 组件失败被视为正常而不是异常。分布式系统由成百上千台的廉价机器组成，被大量的客户端机器访问。机器的数量和质量决定了集群内的机器故障无时无刻都可能发生，而且有些故障是不能被恢复的。常见的故障例如应用程序漏洞、操作系统漏洞、人为错误、硬盘损坏、内存损坏、网络隔离、电源故障等等。
2. 文件的大小在传统标准看来是非常大的。一般文件大小量级在GB级别，并且整体趋势朝着TB发展。在这种情况下，设计理念和参数需要重新设计（例如I/O操作、块大小）。
3. 大部分文件的修改都是追加而不是覆盖。文件内的随机写在实际情况下是非常少的，一般写入后文件只用来读，而且往往是串行读取。很多数据模型都有这样的性质，例如数据仓库、应用实时数据流、数据归档、消息队列等等。在这种情况下，追加操作成为性能优化和原子性保证的重点。
4. 应用程序和文件系统的API被重新设计以便提高系统灵活性。

## 整体设计

### 假设

现在总结下系统设计的前提与假设：

* 系统由大量廉价机器组成，故障经常发生
* 系统存储了海量的大文件
* 工作流主要由两种读组成：大量的流式读取和少量的随机读取
* 工作流还包括大量的大文件追加操作
* 系统必须高效的支持高并发的追加操作
* 高吞吐比低延迟更重要

### 接口

GFS提供了类似于文件系统的接口，文件被组织成层次结构存储在目录内，而且用路径名称（pathname）来标记。GFS支持**create**、**delete**、**open**、**clos**、**read**和**write**操作。

同时，GFS还支持**snapshot**和**record append**操作。snapshot操作可以快速复制文件或者目录树。record append操作允许多个客户端同时追加数据到同一个文件并且保证追加的原子性。这种追加性质在多路归并、消息队列这样的场景中非常有用。

### 架构

GFS集群由一个**master**和多个**chunkserver**组成，被多个**client**访问，如下图所示。

![architecture](/assets/google-file-system/architecture.png)

文件被切割成固定大小的**chunk**，每个chunk被一个不可变且全局唯一的64比特的**chunk handle**标记，chunk handle在chunk创建时由master指定。chunkserver将chun以Linux文件的形式存储在本地磁盘上，通过chunk handle和字节位移进行读写。为了高可用，每个chunk被复制到多个chunkserver，副本默认为3个（副本数量可以配置）。

master维护文件系统的元信息，包含命名空间（namespace）、访问控制、文件与chunk映射以及chunk位置等信息。同时，master还控制系统维度的活动，例如chunk租约管理，chunk回收以及chunk移动等等。master定期与chunkserver通信，通过维护HearBeat来发送指令和收集信息。

GFS client实现了文件系统API，并且与master、chunkserver通信来读写数据。client与master进行文件元数据操作，但内容数据直接与chunkserver交互。

client和chunkserver都不缓存文件数据。client缓存数据没有太大好处，因为应用数据流非常大难以缓存，同时带来缓存一致性问题。chunkserver不缓存数据是因为chunk作为本地文件存储，Linux的buffer cache已经将热点数据放置在内存中。

### 单Master

使用单主结构能够简化设计，同时由于有全局视野，能够对chunk分配和复制有很好的决策。但另一方面，master需要尽可能简化读写以便不成为集群的瓶颈。因此，client不直接从master读取文件数据，它只是从master获取文件相应的chunkserver（并缓存这些信息），随后的读写操作直接与这些chunkserver交互。

说明下上图Figure 1中的读取交互：

1. 根据固定的chunk大小，client将应用需要读取的字节偏移转化成chunk索引（就是第几个chunk）
2. 然后client向master发送请求，包含文件名称和chunk索引
3. master回复相应的chunk handle以及chunk副本的位置
4. client使用文件名称和chunk索引缓存这些信息
5. client向其中最近的一个chunk副本发送请求，请求指明chunk handle和chunk中的字节偏移

由于缓存的缘故，client对于同一个的读取请求不需要再和master交互，除非缓存失效或者文件重新打开。另外，client实际上跟master交互中会同时请求多个chunk的信息。

### chunk大小

chunk大小是设计中的关键因素，GFS选择了64MB作为参数，这个值比一般的文件系统的块（block）要大得多。大的chunk有如下优点：

1. 减少client与master的读写交互。因为对于同一个chunk的读写只需要一次与master的初始化交互即可，另外大文件（GFS主要使用场景是大文件串行读写）切割成的chunk数量更少。
2. 因为chunk比较大，client与chunk会维持长连接，减少建立、断开连接的时间。
3. 减少master的元数据。

但同时大的chunk也有缺点。对于小文件来说，chunk数量非常小，可能只有一个chunk。那么如果多个client访问这些小文件，相应的chunkserver会成为热点。对于这种情况，可能需要将其副本数量调大，以便适应高并发。

### 元数据

master包含三类元数据：1）文件和chunk的命名空间；2）文件与chunk的映射；3）chunk副本的位置。所有的元数据都在master的内存，另外1和2也会保存在master和其他远程机器的日志文件中。master日志不存储chunk位置信息，而是在master启动时以及chunkserver加入时，master会向集群中的chunkserver请求它们的chunk信息。

#### 内存数据

由于元数据存放在内存，master的操作非常快。另外，master进行定时的集群状态扫描也非常容易和高效。这些定时的扫描包括chunk回收，chunkserver故障的处理，chunk的负载均衡等等。

这种纯内存的方案有一个担忧：chunk的数量（或者说集群的容量）由master的内存大小决定。但实际上这个担忧是不必要的，因为：1）对于一个64MB的chunk只占用不足64字节的元数据，而大部分chunk都是满的（除了最后一个chunk）；2）对于文件命名空间，由于前缀压缩，每个文件只占用不足64字节的空间；3）如果需要支持更大的集群，增加master的内存的代价非常小，而换取的灵活性、高可用、高性能却是不可衡量的。

#### chunk位置

master没有对chunk位置信息进行持久化存储，只是在启动的时候向chunkserver拉取信息，同时通过定期的心跳（HearBeat）来保持更新。

GFS设计者一开始打算将chunk位置信息持久化，但是他们发现通过启动拉取和定期维护这样会更简洁。这种设计避免了master和chunkserver的一致性问题，chunkserver对于其chunk信息拥有最终决定权，这是因为chunkserver上的故障随时都可能发生。

#### master的操作日志（Operation Log）

master的操作日志是唯一的元数据持久化日志，而且它决定了在并发操作下的逻辑顺序。文件和chunk（以及其历史版本）在其创建时由master日志决定逻辑顺序。

master的操作日志非常重要，因此GFS将其复制到多台机器上，而且client的操作当且仅当将日志记录刷新到master及各副本机器的磁盘上才算成功。

master通过重放操作日志可以恢复GFS的集群状态，而为了减少重放时间，当操作日志超过一定大小时，master会保存检查点（checkpoint），这样重放时只需通过最新的检查点及其后的操作即可完成。

### 一致性模型

#### GFS的保证

文件命名空间的修改是原子性且安全的，这个由master的命名空间锁保证。同时master的操作日志决定了这些修改操作的全局逻辑顺序。

文件内容块的修改状态得看是何种操作（write或者append）以及并发性。下图总结了修改后的文件内容区状态：

![file-region-mutation](/assets/google-file-system/file-region-mutation.png)

关于consistent与defined定义如下：
* 文件块是**consistent**的，如果所有的client都看到相同的数据（无论从哪个副本上读取）；
* 文件块是**defined**的，如果它是consistent的，并且client能看到写入的完整性；

write操作是应用程序在指定的文件偏移上写入，而append则是GFS决定文件偏移后原子性写入（至少一次），且写入后返回其偏移。

GFS通过如下方法来保证修改是defined的：

1. 将对于chunk的修改以相同的顺序同步到所有的副本；
2. 使用chunk版本号来检测过期的副本（由于chunkserver宕机导致没有同步修改）

过期的副本将不会参与chunk的修改，也不会返回给client，它们将会被垃圾回收。虽然client缓存了chunk的位置信息，它们可能会从过期的副本上读取数据，但是由于缓存会失效以及重新打开文件会清空缓存的缘故，这个时间窗口比较小。而且，因为大多数的文件都是append的，因此一个过期的副本通常返回eof，这样client在重试时会通过向master获取最新的副本。

为了保证修改的持久性，GFS会定期校验chunk的数据并且通过心跳向master反馈，如果存在数据损坏故障，master会从其他正常的副本上拷贝数据再重新生成一个副本。因此，一个chunk丢失当且仅当在GFS处理（分钟级别）前所有的副本都丢失。

#### 应用的处理

GFS应用可以自己解决GFS一致性模型的问题：使用append操作而不是覆盖写、检查点、自检查和自验证等等。

一个典型的使用场景是，writer一直写入文件。这个文件可能是临时文件，在写入完成后将文件重命名以成为永久文件；或者，writer定期生成检查点，记录多少数据被成功写入，这样reader只需要处理检查点前的数据，而这些数据是经过writer了的。

另外一个典型场景是，多个writer并发append到同一个文件中（如多路并发、消息队列等）。由前一小节可知，append操作的语义是至少一次，因此reader需要自己处理重复数据。reader可以通过校验和（checksum）来识别和丢弃重复数据。

## 系统交互

### 租约与修改顺序

为了保证所有副本修改的一致性顺序，master向其中一个副本发放**租约（lease）**，拥有租约的副本成为**主副本（primary）**。主副本决定所有修改的顺序，其他副本应用这个顺序。因此，全局的修改顺序由租约版本以及租约内的序列化版本得到。

租约的有效时间为60秒，如果主副本正在被修改，租约的时间可以申请延长。申请延长的方式是通过心跳机制来完成的。另外，master也可以在租约过期前回收租约。

如果master与主副本连接不上，在老租约过期后master可以安全的发放新租约给另外一个副本。

下面来看下整体交互：


![data-flow](/assets/google-file-system/data-flow.png)

1. client向master获取当前的主副本以及其他副本。
2. master回复主副本以及其他副本的位置，client缓存这些信息。如果主副本连接不上或者主副本反馈租约过期，client会重新向master发起请求以更新副本信息。
3. client将数据推送到所有的副本。client可以以自定义副本顺序来完成数据推送，chunkserver将这些数据存放在内部LRU缓冲区中。
4. 所有副本反馈接收完数据后，client向主副本发送写入请求。主副本对修改分配连续的序列化号，并将修改应用到本地状态。
5. 主副本将写入请求发送到其他副本，其他副本将保持与主副本的写入顺序。
6. 其他副本向主副本反馈写入完成。
7. 主副本回复client。如果存在副本写入失败的情况，异常信息会返回给client；这个client请求会被视为失败，修改的区域成为inconsistent的区域，client代码通过重试来修复错误，也就是重复步骤3到7。

### 数据流


GFS将**数据流**和**控制流**分离。控制流从client到主副本，然后再从主副本到其他副本。而数据流则沿着一条由贪心算法挑选的chunkserver链传播，每台机器从剩下的机器集中选择离它**最近**的机器进行数据传播。假设client需要推送数据到S1、S2、S3、S4，它选择离它最近的chunkserver推送数据，不妨设为S1；而S1从S2-S4中挑选离它最近的机器推送数据，不妨设为S2；相似的，S2推送数据到S3（或者S4）...机器间距离可以通过IP地址来准确计算。

为了减少延迟，每台chunkserver接收到数据时，立即传播到下一台chunkserver。因此，如果没有网络拥塞的话，传输B字节到R个副本所需要的时间为B/T+RL，其中T为网络带宽，L为机器间延迟。机器带宽一般为100Mbps，L一般远小于1ms，因此1MB理想情况下在80ms内传输完毕。

### 原子性的append操作

在传统写入方式中，client指定写入的位移和数据；在GFS的append中，client只指定数据，由GFS决定偏移，然后原子性的append到文件中（至少一次），最后返回写入的偏移给client。如果GFS以传统方式写入的话，那么client需要复杂的、低效的同步机制（例如分布式锁）。

append操作也是一种修改操作，因此和上一节的流程一样，但主副本需要额外增加一点逻辑处理。当client推送数据到所有副本后，client会发送写入请求到主副本；主副本需要检查这个append操作是否会导致chunk的大小超过64MB。如果是的话则将chunk填充到64MB（其他副本也一样），然后回复client通知其append操作需要在下一个chunk重试；如果没有超过64MB，主副本append数据，然后通知其他副本也在相同的偏移append数据，最后返回成功给client。

如果某个副本写入数据失败，那么client将会进行重试。因此，chunk的所有副本可能包含不同的数据，有的可能包含多条重复的记录。GFS并不保证chunk的所有副本它们每个字节都相同，它只保证数据被写入至少一次。如果client写入成功，则表明所有副本在相同的偏移处有相同的记录数据。记录写入成功之后，所有副本都从该记录结尾append新的记录。以一致性保证的角度来看，成功写入的区域是defined（因此也是consistent的），写入失败的区域则是inconsistent（因此也是undefined）。

### 快照

GFS的快照操作实时复制一个文件或者目录树，但同时尽可能减少对正在进行的修改的干扰。快照典型的使用场景例如，对大数据集创建分支，对当前状态创建检查点...

GFS使用copy-on-write技术来实现快照。当master收到快照请求时，它首先回收快照文件的chunk租约，这样client后续的写入需要先和master交互，因此master可以在响应client前创建chunk的拷贝。

master回收完chunk租约（或者chunk租约过期）后，master将快照操作写入磁盘日志，并在内存中复制元数据生成新文件；新的快照文件与原文件指向相同的chunk。

在快照完成后，假如client第一次写入原文件，不妨设为写入chunk C；它先发送请求到master，master发现chunk C当前被不止一个文件引用，因此master通知所有的副本chunkserver创建chunk C的拷贝C'（由于在chunk C的chunkserver直接创建拷贝，因此避免了网络传输）；master对于chunk C’挑选出主副本发放租约，然后返回chunk C’的所有副本信息给client。

## master的操作

### 命名空间的管理与锁

master很多的操作都是非常耗时的，例如快照操作需要回收快照文件所有的chunk租约。GFS为了让多个master操作能并行，对命名空间进行区域加锁以进行串行化。

和传统文件系统不同的是，GFS没有属于目录的汇总数据结构（即无法知道目录下有哪些文件）。在GFS中，命名空间是一个表，将路径名称映射到元数据。通过前缀压缩，这张表可以高效的存放在内存中。文件路径的每个结点（目录或文件）都有一个读写锁。

master在每次操作前都会获取不止一把锁。假设，文件路径为/d1/d2/.../dn/leaf，那么master会获取/d1，/d1/d2，...，/d1/d2/.../dn这些目录的读锁，并最后获取全路径/d1/d2/.../dn/leaf的读锁或写锁（基于操作是读还是写）。注意这里的leaf可能是目录或者文件。

现在来看个具体的例子：在将/home/user生成快照保存为/save/user时，创建/home/user/foo的操作将会被阻止。原因是：快照操作需要获取/home和/save的读锁，以及/home/user和/save/user的写锁；文件创建操作需要获取/home以及/home/user的读锁，以及/home/user/foo的写锁；因为在获取/home/user的锁上有冲突，因此这两个操作会被串行执行。

文件的创建操作不需要对上一级路径获取写锁（与传统文件系统相比），因为GFS中不存在真正意义的“目录”概念。这样有一个很好的性质就是：GFS允许在同一个目录下同时操作多个文件（例如同时创建多个文件）。这是因为这些修改操作只需要获取目录名称的读锁（而不是写锁），和该文件的写锁。而获取目录名称的读锁同时又能够防止目录被删除、重命名或者快照等等；获取文件的写锁能防止同一个文件同时被创建。

由于一次操作需要获取多把锁，因此为了防止死锁，GFS定义的获取锁规则为：首先根据命名路径的level来获取，相同level的根据字典序来获取。

### 副本放置策略

GFS的副本放置需要满足两个目的：最大化数据可用性和最有效的利用带宽。基于这样的目的，GFS不仅仅将副本放置于不同的机器，同时将副本分布于不同的机架。

这样的好处是，即使整个机架都不可用（或者断电），数据仍然不丢失，而且数据读取能最大化的利用机房带宽；但坏处是，写流量需要跨越机架。

### 初始创建、重新复制、均衡

GFS中创建chunk有三种情况：初始创建、重新复制和均衡。

* master初始创建chunk的时候，它选择chunkserver基于这几点：1）chunkserver磁盘利用率；2）chunkserver的“最近”创建chunk数量（这个可以防止新chunkserver被瞬时流量击垮）；3）机架分布；
* 如果由于chunkserver故障，导致chunk的副本数量低于指定数量，master会重新复制chunk。而在所有需要被重新复制的chunk中，又有几个因素决定哪个先被复制：1）副本数量距离目标值多远；2）未删除文件的chunk优先；3）阻塞client的chunk复制优先。master选择优先级最高的chunk，然后复制它，放置在别的chunkserver上。chunkserver的选择与上面类似。
* 最后，master会定期基于副本分布情况重新均衡副本，以更好的利用磁盘和网络。master选择磁盘负载高的chunkserver，将其上面的chunk移动到其他chunkserver中（目标chunkserver的选择与上述类似）。

## 垃圾回收

在GFS中，文件被删除时，物理存储不会立即被回收。物理存储在垃圾回收阶段才会被回收。

### 回收机制

当文件被删除时，master记录这个操作到日志中，然后将文件重新命名成隐藏文件并加上删除时间戳。

在master对文件命名空间的定期扫描中，超过3天（可以设置）的隐藏文件会被删除，在此之前该文件都是可以读的并且可以通过rename的方式变成正常文件。当隐藏文件从命名空间删除时，它在master内存中的元数据会被清除，指向chunk的引用也被清除。

类似地，在对chunk命名空间进行定期扫描时，会识别出没有被文件引用的chunk并清除元数据。当chunkserver通过心跳向master汇报它的chunk时，master告知它没有元数据的chunk，然后chunkserver删除这些chunk。

### 讨论

上述方案相比于立即回收有这几点好处：

* 简单且可靠。首先，chunk创建时可能会失败，从而导致存在master不知晓的chunk；其次，如果立即回收，master发送的副本删除消息可能丢失，需要实现重试机制。通过上述方案，废弃的chunk可以被简单且可靠的回收。
* 通过定期扫描和处理的方式，垃圾可以被批量回收，开销被分摊。另外，master可以在空闲的时候进行垃圾回收，避免影响client请求。
* 这种方式可以避免文件被错误删除而导致丢失。

而主要的坏处是，在用户持续创建和删除的情景下，由于延迟可能会导致垃圾不能被立即回收。因此，GFS做了一些改进：1）对于用户明确要删除的文件（即删除隐藏文件），GFS立即回收垃圾；2）GFS允许用户对不同的命名空间区域设置复制和回收策略，例如用户可以设置某些目录下的文件chunk不进行冗余复制，也可以设置文件删除时立即回收垃圾。

### 过期副本检测

如果chunkserver在宕机时错过client的更新，那么这些chunk的副本会变成过期的chunk。为了识别chunk副本是否过期，master会维护chunk的版本号。当master发放chunk租约时，它会增加chunk版本并且通知所有的副本，master和所有的chunk副本都会记录最新的版本。如果某个副本当前不可用，那么它的版本号则是旧的；当这个副本的chunkserver重启后，它会向master上报chunk及其版本号，master可以检测出这个chunkserver的副本是旧的。另外，如果master发现chunkserver上报的版本号比它自己记录的还要新，那么可以判断出master在发放租约时宕机了，master将会更新其版本号。过期的chunk将会在垃圾回收阶段被回收。

当client向master请求chunk租约（或者chunkserver向另外一个chunkserver复制chunk）时，master都会返回chunk的版本号，这样client和chunkserver在执行操作时可以验证数据是不是最新的。

## 错误容忍与诊断

GFS中机器的数量与质量决定了集群中机器故障是经常发生的，因此机器、硬盘在设计理念中不能完全被信赖。下面总结GFS中处理故障的设计方法。

### 高可用

GFS保持集群高可用的方法很简单但很有用：快速恢复与复制。

#### 快速恢复

GFS中master与chunkserver无论以何种方式终止服务都会在立即重新启动并且恢复停止前状态。实际上，GFS不会区分正常终止或者异常终止。在重启期间，client可能会感知到服务抖动，然后重新连接上重启后的机器，并重试请求。

#### chunk复制

如前所述，每个chunk都会复制到不同的机架、不同的机器上，默认的复制因子为3（可以配置）。这种机制能够避免chunkserver宕机或者数据损坏导致不可用。

#### master的副本

为了保证可用性，master也需要做复制，它的操作日志以及检查点都会复制到多台机器上。当进行改动操作时，当且仅当其日志记录被刷新到磁盘以及同步到所有的master副本机器后，才算提交成功。为了简单，在正常情况下只有一台master负责管理所有的集群改动（包括后台的垃圾回收等等）；如果这台master机器宕机了，那么GFS外的监控机制会在副本机器中重新启动一个新的master。另外，client只是用master的DNS别名，这个可以被更改如果master在新的机器上启动。

此外，GFS中还有“影子”master，当master宕机后，“影子”master可以提供只读的服务。之所以称之为“影子”而不是镜像，是因为它们与master存在一定的落后窗口，这个窗口通常小于1s。这些“影子”master提高了集群的读数据的可用性。由于应用是从chunkserver中读取文件内容数据，因此对于内容数据来说，“影子”master机制不存在内容落后的问题；“影子”master存在的落后问题是文件的元数据（例如目录内容、访问控制等等）。在实现上，“影子”master不断读取master的操作日志，并且应用到它自身的数据结构中；同样像主master一样，它在启动时会跟chunkserver进行chunk信息通信，并且维护心跳，它依赖主master的地方是chunk副本位置的变更（由于主master创建、删除chunk副本导致，如前所述）。

### 数据完整性

chunkserver使用校验和来检测数据是否损坏。对于拥有成千上万块磁盘的GFS集群来说，数据损坏或丢失是经常发生的。虽然GFS能够使用别的副本来恢复数据，但是通过不同副本对比来找出数据损坏的副本不是一个可行的方案，况且每个副本的字节不是完全一致的（如前所述）。因此每个chunkserver必须自己通过校验和来保证数据完整性。

一个chunk被切割成64KB的block，每一个block有32bit的校验和。像其他元数据一样，校验和既存放在内存，也保存在日志文件中，并且不和用户数据放在一块（避免同时损坏）。在client或者别的chunkserver请求数据的时候，当前的chunkserver需要首先检测数据块是否通过校验。如果一个数据块与之前的校验和不匹配，那么chunkserver会返回错误，并向master反馈数据异常；请求者收到错误后会向其他副本进行重试，而master会进行通过其他有效副本重新创建一个新的副本，并且删除当前的异常副本。

校验对于读请求来说几乎没有影响，因为读请求一般跨越block，因此只有小部分的多余数据被用来计算校验。而且，原数据校验和的读取和查找是在内存直接进行的不需要I/O，而计算校验和通常与I/O并行。

对于写数据来说，因为append是GFS的主要操作，因此GFS重点优化了append操作的校验和计算。在append一个block时，GFS会不断更新校验和；当填充完一个block后，GFS会重新计算校验和。对于没有填充完的block来说，即使它的数据损坏了而且在append完成时没有被检测出来，在下次读时也会被检测出来。

如果写数据不是append而是覆盖的话，GFS会校验覆盖区域的第一个和最后一个block，通过后才会执行覆盖写，然后计算整个区域的校验和。这是因为，如果不检查第一个和最后一个block的检验和，未被覆盖的block区域的数据损坏问题会被隐藏掉（也就是说，第一个和最后一个block中存在未被覆盖的部分，这部分被读出来后必须检查是否数据正确）。

在空闲的时候，chunkserver也会扫描和检测磁盘数据是否损坏，如果检测到数据损坏，master会根据其他有效副本重新创建新的一个副本，并删除当前的错误副本。这样可以避免集群中存在大量的不活跃但却是损坏的数据。

### 诊断工具

诊断日志在GFS中发挥重要的作用，它能够帮助问题定位、debug以及性能分析，同时几乎不带来副作用。GFS的诊断日志记录重要的事件（例如chunkserver宕机与重启），以及RPC的请求与响应。这些诊断日志可以随时删掉，但如果空间允许的话GFS会尽量保留。

RPC日志只会包括请求和响应数据，但不包括文件数据的具体内容。通过收集不同机器的RPC日志，整个调用链路可以复现来诊断问题。

最后，记录日志的性能损耗是非常小的，因为日志是顺序写且是异步的。