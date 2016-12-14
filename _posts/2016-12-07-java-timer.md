---
layout: post
title: "Java进阶之Timer定时器"
keywords: "Java,Timer"
description: "Java进阶之Timer定时器"
date: 2016-12-07 22:00
categories: ["Java"]
---

在Java中实现定时执行任务有多种方式：

* [Timer](https://docs.oracle.com/javase/7/docs/api/java/util/Timer.html)
* [ScheduledThreadPoolExecutor](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/ScheduledThreadPoolExecutor.html)
* [Quartz](http://www.quartz-scheduler.org/)
* ...

今天来聊一聊Timer的使用以及它背后的实现。

### 使用

Timer定时器提供了一些接口让我们提交定时任务，而这些定时任务最终会被Timer中的一个线程执行。而定时任务可以设置只在某个特定时刻执行，也可以设置成在重复执行。

这些任务的执行是有可能相互影响的，任务实际的执行时间可能不会按照之前设定的时间执行。譬如我们向一个Timer提交了定时任务a和定时任务b，a在b的前100ms执行；当Timer的线程执行任务a而且任务a耗时超过100ms时，任务b会被延后执行。因为该线程执行完任务a后才能执行任务b。

先来看下构造函数：

![timer-constructor](/assets/java-timer/timer-constructor.png)

对于守护线程和前台线程有如下两点需要了解：

* 当jvm中所有前台线程退出后，守护线程无论是否执行任务都会**自动**退出
* 当所有线程退出后，jvm进程退出

所以如果我们用Timer()来创建定时器的话，那么Timer的执行线程以前台线程方式一直执行，可能会阻止应用退出。



下面来看下Timer提交定时任务的接口：

![timer-schedule](/assets/java-timer/timer-schedule.png)

其中对于重复执行任务的接口可以分成两类（上图绿色和橙色）：

1. 绿色（fixed-delay）：对于这种任务，每次重复执行的时刻都相对于上一次实际执行的时刻delay一定时间执行。举个例子，假如任务a设置在时刻0执行，并且设定每次相对于上次延迟5单位时间执行；那么时刻0执行完后下一次应该在时刻5执行，但如果由于别的任务影响，时刻5没有执行推迟到时刻6执行，那么再下一次的执行时间会相对于时刻6延迟5单位时间，也就是在时刻11执行。

2. 橙色（fixed-rate）：对于这种任务，以第一次执行时刻为起点每隔特定间隔重复执行。举个例子，假如任务a设置在时刻0执行，并且设定每隔5单位时间执行；那么任务a执行的时刻为0，5，10，15...如果任务a在时刻5由于别的任务影响推迟到6执行，下一次的执行时间仍然会在时刻10执行。


### 实现

Timer的实现是比较简单的。它主要包含一个任务队列和一个执行线程：

{% highlight java %}

//任务队列
private final TaskQueue queue = new TaskQueue();

//执行线程
private final TimerThread thread = new TimerThread(queue);

{% endhighlight %}


任务队列内部使用了一个[基于数组的二叉堆](http://www.cse.hut.fi/en/research/SVG/TRAKLA2/tutorials/heap_tutorial/taulukkona.html)，堆顶是将要执行的任务。

当添加一个新的任务时，会先把它添加到堆底，然后基于执行时间向上调整：


{% highlight java %}

void add(TimerTask task) {
   // Grow backing store if necessary
   if (size + 1 == queue.length)
       queue = Arrays.copyOf(queue, 2*queue.length);

   queue[++size] = task;
   fixUp(size);
}

private void fixUp(int k) {
   while (k > 1) {
       int j = k >> 1;
       if (queue[j].nextExecutionTime <= queue[k].nextExecutionTime)
           break;
       TimerTask tmp = queue[j];  queue[j] = queue[k]; queue[k] = tmp;
       k = j;
   }
}

{% endhighlight %}


当执行完堆顶任务时，将一个堆底任务放到堆顶，size减1，并向下调整：


{% highlight java %}

void removeMin() {
    queue[1] = queue[size];
    queue[size--] = null;  // Drop extra reference to prevent memory leak
    fixDown(1);
}

private void fixDown(int k) {
    int j;
    while ((j = k << 1) <= size && j > 0) {
        if (j < size &&
            queue[j].nextExecutionTime > queue[j+1].nextExecutionTime)
            j++; // j indexes smallest kid
        if (queue[k].nextExecutionTime <= queue[j].nextExecutionTime)
            break;
        TimerTask tmp = queue[j];  queue[j] = queue[k]; queue[k] = tmp;
        k = j;
    }
}

{% endhighlight %}

以上为任务队列的内部实现。下面来看下执行线程的内部实现：


{% highlight java %}

private void mainLoop() {
    while (true) {
        try {
            TimerTask task;
            boolean taskFired;
            synchronized(queue) {
                //等待任务队列非空
                while (queue.isEmpty() && newTasksMayBeScheduled)
                    queue.wait();
                //如果队列仍是为空，那么是整个Timer被取消了，newTasksMayBeScheduled设置为false，执行线程退出
                if (queue.isEmpty())
                    break;

                //队列非空，执行任务 
                long currentTime, executionTime;
                //取将要执行的任务，也就是堆顶任务
                task = queue.getMin();
                synchronized(task.lock) {
                //如果该任务已经被取消了，那么重新循环
                    if (task.state == TimerTask.CANCELLED) {
                        queue.removeMin();
                        continue;
                    }
                    currentTime = System.currentTimeMillis();
                    executionTime = task.nextExecutionTime;
                    //taskFired表示是否现在执行任务
                    if (taskFired = (executionTime<=currentTime)) {
                        if (task.period == 0) {
                            //如果不是重复执行的任务，那么从队列中直接移除任务
                            queue.removeMin();
                            task.state = TimerTask.EXECUTED;
                        } else {
                            //如果是重复执行的任务，那么重新设置任务的时间，并做堆调整。
                            //当period为负值时，定时任务为fix-delay类型，因此下次执行时间相对当前执行时间推迟|period|时间执行；
                            //当period为正数时，定时任务为fix-rate类型，下次执行时间相对之前计划的执行时间推迟period时间执行。
                            queue.rescheduleMin(
                              task.period<0 ? currentTime   - task.period
                                            : executionTime + task.period);
                        }
                    }
                }
                //如果将要执行的任务仍未到时刻，那么先等待相应时间。到时间后，在下一个循环执行任务。
                if (!taskFired)
                    queue.wait(executionTime - currentTime);
            }
            //如果任务在本循环已经到达时间了，那么执行
            if (taskFired)
                task.run();
        } catch(InterruptedException e) {
        }
    }
}

{% endhighlight %}


具体细节见上面代码注释。

其中当执行线程在wait的时候，如果这时新加了一个新的定时任务，而新的定时任务在现有的所有任务前执行，那么在添加定时任务时需要主动notify执行线程，以便执行线程重新计算等待时间：

{% highlight java %}

private void sched(TimerTask task, long time, long period) {
     if (time < 0)
         throw new IllegalArgumentException("Illegal execution time.");

     if (Math.abs(period) > (Long.MAX_VALUE >> 1))
         period >>= 1;

     synchronized(queue) {
         if (!thread.newTasksMayBeScheduled)
             throw new IllegalStateException("Timer already cancelled.");

         synchronized(task.lock) {
             if (task.state != TimerTask.VIRGIN)
                 throw new IllegalStateException(
                     "Task already scheduled or cancelled");
             task.nextExecutionTime = time;
             task.period = period;
             task.state = TimerTask.SCHEDULED;
         }

         //添加任务并调整堆
         queue.add(task);
         //如果新的定时任务为最快要执行的任务，那么唤醒执行线程重新计算等待时间
         if (queue.getMin() == task)
             queue.notify();
     }
}

{% endhighlight %}


以上。


