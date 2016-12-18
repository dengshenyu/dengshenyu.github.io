---
layout: post
title: "Java进阶之ThreadPoolExecutor"
keywords: "Java,ThreadPoolExecutor"
description: "Java进阶之ThreadPoolExecutor"
date: 2016-12-17 22:00
categories: ["Java"]
---

Java线程池使用无外乎如下几种：

1. 使用自定义ThreadPoolExecutor
2. 使用Executors.newCachedThreadPool()
3. 使用Executors.newFixedThreadPool(int)
4. 使用Executors.newSingleThreadExecutor()

其中使用2，3，4来创建线程池时，其内部也是通过ThreadPoolExecutor来生成线程池的。今天我们来分析下ThreadPoolExecutor的构造参数以及内部实现。

### 构造参数

ThreadPoolExecutor完整的构造方法如下（其他的构造方法提供了参数缺省值）：

{% highlight java %}

public ThreadPoolExecutor(int corePoolSize,
                              int maximumPoolSize,
                              long keepAliveTime,
                              TimeUnit unit,
                              BlockingQueue<Runnable> workQueue,
                              ThreadFactory threadFactory,
                              RejectedExecutionHandler handler)

{% endhighlight %}

#### corePoolSize和maximumPoolSize

当一个新任务提交的时候，发生如下情况之一会创建新任务线程：1）当前线程个数小于corePoolSize；2）当前线程个数大于corePoolSize但小于maximumPoolSize，且任务队列已满。

我们可以设置maximumPoolSize和corePoolSize的值相同，这样无论任务是否繁忙线程池个数始终会稳定在某个特定值。

#### keepAliveTime和timeUnit

如果线程池目前有超过corePoolSize个线程，超出的线程空闲时间大于keepAliveTime（时间单位由timeUnit指定）时会自动终止。

这个策略默认只是针对超出corePoolSize的线程，但我们也可以通过allowCoreThreadTimeOut(boolean)使得它对corePoolSize中的线程同样生效。

#### workQueue

workQueue指定了线程池的任务队列，任何类型的BlockingQueue都可以作为任务队列。

任务队列和线程数有一定关系，提交一个新任务时可能会发生如下情况：

1. 当前线程数少于corePoolSize，那么新任务提交时总是会生成新线程（而不是放在任务队列中）执行任务。
2. 线程数大于或等于corePoolSize，任务会通过workQueue.offer(command)提交在任务队列中排队，并由目前已有的线程执行。
3. 如果任务排队失败，若线程数小于maximumPoolSize则生成新线程来执行任务，否则拒绝任务。

workQueue.offer接口提交失败的原因可以概括为任务队列已满，但具体细节依赖于该workQueue的实现。譬如，如果使用[LinkedBlockingQueue](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/LinkedBlockingQueue.html)，那么在任务数达到阈值时候调用workQueue.offer会失败；如果使用[SynchronousQueue](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/SynchronousQueue.html)，那么如果没有另一个线程在等待任务的时候会调用workQueue.offer会失败（也可以理解为队列已满）。


#### ThreadFactory

当需要创建新线程时，会调用threadFactory.newThread(Runnable r)来创建新线程。

ThreadFactory接口只包含一个newThread方法。我们可以简单实现它：

{% highlight java %}

class SimpleThreadFactory implements ThreadFactory {
   public Thread newThread(Runnable r) {
     return new Thread(r);
   }
}

{% endhighlight %}

我们也可以通过[Executors.defaultThreadFactory()](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/Executors.html#defaultThreadFactory())来生成一个简单的ThreadFactory，这是比较常用的做法。

#### RejectedExecutionHandler

新任务提交时，如果发生以下两种情况之一那么任务会被拒绝：

* 线程池正在关闭
* 线程数达到maximumPoolSize并且任务队列已满

下面看下四种预定义的拒绝策略：

1. [ThreadPoolExecutor.AbortPolicy](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/ThreadPoolExecutor.AbortPolicy.html)：抛出运行时异常RejectedExecutionException。这种策略为默认的拒绝策略。
2. [ThreadPoolExecutor.CallerRunsPolicy](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/ThreadPoolExecutor.CallerRunsPolicy.html)：由当前提交任务的线程执行任务。
3. [ThreadPoolExecutor.DiscardPolicy](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/ThreadPoolExecutor.DiscardPolicy.html)：默默的丢弃当前任务。
4. [ThreadPoolExecutor.DiscardOldestPolicy](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/ThreadPoolExecutor.DiscardOldestPolicy.html)：丢弃最老的尚未执行的任务，并重新提交。


### 内部实现

ThreadPoolExecutor的关键逻辑在于内部状态、任务线程创建及运行。

其中任务线程的创建是在调用ThreadPoolExecutor.execute提交任务时触发的。另外，ThreadPoolExecutor中没有单独的线程来维护内部状态以及任务调度，每个任务线程在运行中需要根据ThreadPoolExecutor的状态字做出相应的响应。譬如，如果线程通过状态字检测到线程池正在关闭，那么它需要执行自身清理操作并退出。

因此我们可以从以下三个角度来分析其内部实现：

1. ThreadPoolExecutor状态
2. 任务提交
3. 任务线程运行逻辑

#### 线程池状态

ThreadPoolExecutor有5种状态，如下所示：

1. Running：接收新任务和处理已排队任务
2. Shutdown：不接收新任务，但处理已排队任务
3. Stop：不接收新任务也不处理已排队任务，并停止正在执行中的任务
4. Tidying：处于这个状态时所有任务都已经被停止，所有线程即将执行terminated()钩子方法
5. Terminated：terminated()方法执行完毕

ThreadPoolExecutor内部使用一个32bit的状态字**ctl**来保存状态及线程数信息，相关代码如下所示：

{% highlight java %}

private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));
private static final int COUNT_BITS = Integer.SIZE - 3;

//线程池状态
private static final int RUNNING    = -1 << COUNT_BITS;
private static final int SHUTDOWN   =  0 << COUNT_BITS;
private static final int STOP       =  1 << COUNT_BITS;
private static final int TIDYING    =  2 << COUNT_BITS;
private static final int TERMINATED =  3 << COUNT_BITS;

//rs（runState）表示运行状态，wc（workerCount）表示线程数，此方法将运行状态和线程数拼接成一个32bit的整数
private static int ctlOf(int rs, int wc) { return rs | wc; }

{% endhighlight %}

ctl为32bit的状态字，它可以分为两部分，高位3个bit为状态信息，低位29个bit为线程数。高位3个bit的值表示状态如下：

* 111：Running
* 000：Shutdown
* 001：Stop
* 010：Tidying
* 011：Terminated

如果将ctl看作整数，那么Running状态的状态字为负数，其他状态的状态字为非负数，并且保持一个严格递增关系：Running < Shutdown < Stop < Tidying < Terminated。


#### 任务提交

代码实现如下：

{% highlight java %}

public void execute(Runnable command) {
     if (command == null)
         throw new NullPointerException();
     int c = ctl.get();
     if (workerCountOf(c) < corePoolSize) {
         if (addWorker(command, true))
             return;
         c = ctl.get();
     }
     if (isRunning(c) && workQueue.offer(command)) {
         int recheck = ctl.get();
         if (! isRunning(recheck) && remove(command))
             reject(command);
         else if (workerCountOf(recheck) == 0)
             addWorker(null, false);
     }
     else if (!addWorker(command, false))
         reject(command);
}

{% endhighlight %}

下面来一步步分析其逻辑：

1. 首先通过ctl.get()来获取状态字，并且通过workerCountOf(c)来获取状态字中的任务线程数。

2. 如果当前线程数小于corePoolSize，那么调用addWorker创建新任务线程执行任务。创建线程成功则返回，失败则重新获取状态字，进行步骤3。创建失败分两种情况：1）线程池正在关闭；2）并发执行时，另一个线程提交任务调用创建线程成功使得线程数大于或等于corePoolSize。

3. 如果线程池仍在运行状态，那么通过workQueue.offer提交任务到任务队列。提交成功后，由于存在并发执行的情况，需要重新对运行状态及线程数进行判断。如果此时不再处于Running状态那么需要移除任务并且执行拒绝任务策略；如果此时线程数为0，那么需要创建新线程保证任务执行。提交失败则进行步骤4。

4. 到达这一步可能情况为线程池正在关闭或者任务队列已满导致任务提交失败，这里统一进行创建新任务线程处理，创建失败则拒绝任务。

其中，addWorker主要分为两部分逻辑：1）修改状态字以增加任务线程数；2）启动任务线程。代码并不复杂，感兴趣的同学可以看下其实现，这里不再赘述。

#### 任务线程运行逻辑

任务线程（Worker）的主要运行逻辑代码如下：


{% highlight java %}

final void runWorker(Worker w) {
    Thread wt = Thread.currentThread();
    Runnable task = w.firstTask;
    w.firstTask = null;
    w.unlock();
    boolean completedAbruptly = true;
    try {
        while (task != null || (task = getTask()) != null) {
            w.lock();
            if ((runStateAtLeast(ctl.get(), STOP) ||
                 (Thread.interrupted() &&
                  runStateAtLeast(ctl.get(), STOP))) &&
                !wt.isInterrupted())
                wt.interrupt();
            try {
                beforeExecute(wt, task);
                Throwable thrown = null;
                try {
                    task.run();
                } catch (RuntimeException x) {
                    thrown = x; throw x;
                } catch (Error x) {
                    thrown = x; throw x;
                } catch (Throwable x) {
                    thrown = x; throw new Error(x);
                } finally {
                    afterExecute(task, thrown);
                }
            } finally {
                task = null;
                w.completedTasks++;
                w.unlock();
            }
        }
        completedAbruptly = false;
    } finally {
        processWorkerExit(w, completedAbruptly);
    }
}

{% endhighlight %}


这里可以看到，任务线程一直通过**getTask()**来获取任务并执行，直到获取任务失败返回null退出当前线程。

而getTask实现如下：

{% highlight java %}

private Runnable getTask() {
    boolean timedOut = false;

    for (;;) {
        int c = ctl.get();
        int rs = runStateOf(c);

        if (rs >= SHUTDOWN && (rs >= STOP || workQueue.isEmpty())) {
            decrementWorkerCount();
            return null;
        }

        int wc = workerCountOf(c);

        boolean timed = allowCoreThreadTimeOut || wc > corePoolSize;

        if ((wc > maximumPoolSize || (timed && timedOut))
            && (wc > 1 || workQueue.isEmpty())) {
            if (compareAndDecrementWorkerCount(c))
                return null;
            continue;
        }

        try {
            Runnable r = timed ?
                workQueue.poll(keepAliveTime, TimeUnit.NANOSECONDS) :
                workQueue.take();
            if (r != null)
                return r;
            timedOut = true;
        } catch (InterruptedException retry) {
            timedOut = false;
        }
    }
}

{% endhighlight %}


getTask方法返回null时，任务线程会退出。现在我们一步步分析其逻辑：

1. 如果线程池正在关闭则返回null。
2. 当前线程数为如下情形时返回null：1）大于maximumPoolSize；2）大于corePoolSize并且空闲时间超过keepAliveTime；3）设置了allowCoreThreadTimeOut并且当前空闲时间超过keepAliveTime。注意的是，由于存在并发情况，这里做了最后一层检查，即如果当前线程为最后一个线程且任务队列非空那么会再次获取任务以执行完任务队列里的任务。
3. 通过workQueue.poll()或者workQueue.take()来阻塞获取任务，这两种方法区别在于：前者为等待有限时间，后者为无限等待。有限等待的情况为，当前任务线程数大于corePoolSize或者设置了allowCoreThreadTimeOut。


### 总结

本文分析了ThreadPoolExecutor的使用参数以及内部实现，其实现比较简单，感兴趣的同学可以看下其源码:)

以上。
