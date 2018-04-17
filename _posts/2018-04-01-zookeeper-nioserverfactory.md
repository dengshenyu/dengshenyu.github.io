---
title: Zookeeper源码分析--NIOServerCnxnFactory
layout: post
keywords: Zookeeper
description: Zookeeper集群选举源码分析
date: 2018-04-01 21:00
categories:
- 分布式系统
---

Zookeeper可以说是业界最流行的分布式协调解决方案，其源码值得我们好好静下心来学习和研究。从本系列开始，我将会分享Zookeeper中最核心的代码，希望对大家有所帮助和启发。

这篇文章主要分析NIOServerCnxnFactory这个类。NIOServerCnxnFactory和NettyServerCnxnFactory是Zookeeper服务端用来处理连接的核心类，前者基于NIO，后者基于Netty框架。废话少说，让我们一起来看下NIOServerCnxnFactory这个类是如何实现的：）。


### NIOServerCnxnFactory

NIOServerCnxnFactory基于NIO实现了一个多线程的ServerCnxnFactory，线程间的通信都是通过queue来完成的。NIOServerCnxnFactory包含的线程如下：

* 1个accept线程，用来监听端口并接收连接，然后把该连接分派给selector线程。
* N个selecotr线程，每个selctor线程平均负责1/N的连接。使用N个selector线程的原因在于，在大量连接的场景下，select()操作本身可能会成为性能瓶颈。
* N个worker线程，用来负责socket的读写。如果N为0，那么selector线程自身会进行socket读写。
* 1个管理连接的线程，用来关闭空闲而且没有建立session的连接。

NIOServerCnxnFactory的启动入口为startup方法，如下所示：

{% highlight java %}

public void startup(ZooKeeperServer zks, boolean startServer)
        throws IOException, InterruptedException {
    //自身的启动逻辑
    start();
    //设置zkServer
    setZooKeeperServer(zks);
    if (startServer) {
        //启动zkServer
        zks.startdata();
        zks.startup();
    }
}

{% endhighlight %}

start()方法包含自身的启动逻辑，而zks.startdata()和zks.startup()用来启动zkServer。NIOServerCnxnFactory是用来管理连接的，而数据处理逻辑则由zkServer完成。start()方法的逻辑如下所示：

{% highlight java %}

public void start() {
    stopped = false;
    //worker线程服务，用来进行socket的I/O
    if (workerPool == null) {
        workerPool = new WorkerService(
            "NIOWorker", numWorkerThreads, false);
    }
    //selector线程，用来监听socket事件
    for(SelectorThread thread : selectorThreads) {
        if (thread.getState() == Thread.State.NEW) {
            thread.start();
        }
    }
    // accept线程
    if (acceptThread.getState() == Thread.State.NEW) {
        acceptThread.start();
    }
    // 连接管理线程
    if (expirerThread.getState() == Thread.State.NEW) {
        expirerThread.start();
    }
}

{% endhighlight %}

可以看到，start方法主要生成或启动上述的accept线程、selector线程、worker线程和连接管理线程。

#### accept线程

accept线程的run()方法如下：

{% highlight java %}

public void run() {
    try {
         //判断是否需要退出
        while (!stopped && !acceptSocket.socket().isClosed()) {
            try {
                //监听连接事件，并建立连接
                select();
            } catch (RuntimeException e) {
                LOG.warn("Ignoring unexpected runtime exception", e);
            } catch (Exception e) {
                LOG.warn("Ignoring unexpected exception", e);
            }
        }
    } finally {
        //关闭selector
        closeSelector();

        if (!reconfiguring) {
            //唤醒selector线程并通知worker线程关闭
            NIOServerCnxnFactory.this.stop();
        }
        LOG.info("accept thread exitted run method");
    }
}

{% endhighlight %}


accept线程主要监听连接事件，并建立连接，并分派给selector。在退出时，关闭它自身的selector，然后唤醒用来进行socket I/O的selector线程，最后通知worker线程退出。

accept线程在select方法中监听连接事件，然后进入doAccept()方法建立连接，分派给selector线程，doAccept()方法如下所示：

{% highlight java %}

private boolean doAccept() {
    boolean accepted = false;
    SocketChannel sc = null;
    try {
        //建立连接
        sc = acceptSocket.accept();
        accepted = true;
        //防止来自一个IP的连接是否过多
        InetAddress ia = sc.socket().getInetAddress();
        int cnxncount = getClientCnxnCount(ia);
        if (maxClientCnxns > 0 && cnxncount >= maxClientCnxns){
            throw new IOException("Too many connections from " + ia
                                  + " - max is " + maxClientCnxns );
        }
        LOG.info("Accepted socket connection from "
                 + sc.socket().getRemoteSocketAddress());
        sc.configureBlocking(false);

        //使用轮询来将连接分派给某个selector线程
        if (!selectorIterator.hasNext()) {
            selectorIterator = selectorThreads.iterator();
        }
        SelectorThread selectorThread = selectorIterator.next();
        if (!selectorThread.addAcceptedConnection(sc)) {
            throw new IOException(
                "Unable to add connection to selector queue"
                + (stopped ? " (shutdown in progress)" : ""));
        }
        acceptErrorLogger.flush();
    } catch (IOException e) {
        acceptErrorLogger.rateLimitLog(
            "Error accepting new connection: " + e.getMessage());
        fastCloseSock(sc);
    }
    return accepted;
}

{% endhighlight %}


如代码注释所示，doAccept方法主要做了两件事：
* 如果某个客户端连接过多则拒绝其建立新连接，防止少量客户端占用所有连接资源。
* 使用轮询来从N个selector线程中选出一个selector线程，并且调用selectorThread.addAcceptedConnection(sc)方法来将连接分派给该selector线程。调用该方法会把连接扔到这个selector线程的acceptedQueue（类型为LinkedBlockingQueue）中，然后调用selector.wakeup()唤醒selector进行处理。

#### selector线程

selector线程的run方法如下所示：

{% highlight java %}

public void run() {
    try {
        while (!stopped) {
            try {
                //监听读写事件并处理
                select();

                //处理accept线程新分派的连接
                processAcceptedConnections();

                //更新连接监听事件
                processInterestOpsUpdateRequests();
            } catch (RuntimeException e) {
                LOG.warn("Ignoring unexpected runtime exception", e);
            } catch (Exception e) {
                LOG.warn("Ignoring unexpected exception", e);
            }
        }

    //......

    } finally {
        closeSelector();

        // 唤醒accept线程及其他线程，并通知worker线程退出
        NIOServerCnxnFactory.this.stop();
        LOG.info("selector thread exitted run method");
    }
 }

{% endhighlight %}


可以看到，selector线程主要做三件事：

* select()：监听读写事件并处理；
* processAcceptedConnections()：处理accept线程新分派的连接；
* processInterestOpsUpdateRequests()：更新连接监听事件

其中在select()方法中，selector线程会把有事件发生的连接封装成IOWorkRequest对象，然后调用workerPool.schedule(workRequest)来交给worker线程来处理。

#### worker线程

worker线程的核心处理逻辑在IOWorkRequest的doWork()中，如下所示：

{% highlight java %}

public void doWork() throws InterruptedException {
    //如果Channel已经关闭则清理该SelectionKey
    if (!key.isValid()) {
        selectorThread.cleanupSelectionKey(key);
        return;
    }
    //如果可读或可写，则调用NIOServerCnxn.doIO方法，通知NIOServerCnxn连接对象进行IO读写及处理
    if (key.isReadable() || key.isWritable()) {
        cnxn.doIO(key);

        //如果已经shutdown则关闭连接
        if (stopped) {
            cnxn.close();
            return;
        }
        //如果Channel已经关闭则清理该SelectionKey
        if (!key.isValid()) {
            selectorThread.cleanupSelectionKey(key);
            return;
        }
        //更新该会话的过期时间
        touchCnxn(cnxn);
    }

    //已经处理完读写，重新标记该连接已准备好新的select事件监听
    cnxn.enableSelectable();

    //把该连接重新放到selectThread的updateQueue中，selectThread会在处理处理完所有Channel的读写和新连接后，更新此Channel的注册监听事件
    if (!selectorThread.addInterestOpsUpdateRequest(key)) {
        cnxn.close();
    }
}


{% endhighlight %}

具体逻辑见代码注释。