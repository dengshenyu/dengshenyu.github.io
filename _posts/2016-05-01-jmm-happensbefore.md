---
layout: post
title: "JMM的happens-before规则"
keywords: Java,并发编程,JMM
description: "Java的并发编程"
date: 2016-05-01 15:00
categories: computer
---

书读百遍，其义自见，此话不假。

对于Java中的内存模型，自己虽然接触过很多遍，但其实认识不够深入。在读了[深入理解Java内存模型](http://www.infoq.com/resource/minibooks/java_memory_model/zh/pdf/think_deep_in_java_mem_model.pdf)之后，对JMM的理解加深了一点。本文主要讨论JMM中的happens-before规则。

我们知道，JMM有如下四条规则：

* 程序顺序规则：一个线程中的每个操作，happens-before于该线程中的任意后续操作
* 监视器锁规则：对一个监视器的解锁，happens-before于随后对这个监视器的加锁
* volatile变量规则：对一个volatile域的写，happens-before于任意后续对这个volatile的读
* 传递性：如果A happens-before B，且B happens-before C，那么A happens-before C。

我之前也了解这四条规则，但其实认识不深。例如监视器锁规则，解锁行为肯定发生在加锁行为之前啊，所以呢？这条规则所包含的意义是什么呢？

接下来我们来简单讨论下。

## JMM是什么？

首先，Java是一门支持并发编程的语言，说的通俗点是一门支持多线程编程的语言。那么线程之间如何怎么通信的呢？一般有两种方法，**共享内存**和**消息传递**。Java采用的是共享内存的方式。

其次，当一个线程读/写一个变量时，这个读写操作真的会发生在内存吗？**不一定**。我们知道，为了提升性能，编译器和处理器都会进行一定的优化，而这些优化往往是我们看不见的。例如，在CPU和主内存中间有一个高速缓存，CPU在读写的时候先访问高速缓存，如果不能满足其次才会访问主内存。所以，当一个线程写一个变量时，这个写操作可能只发生在高速缓存中，而没有刷新到主内存。

如果只有一个线程执行或者CPU只有一个，这个行为并不重要。但在多线程及多CPU情况下，如果一个线程a正在CPU_1上执行，而同时有另外一个线程b在CPU_2上执行呢？a在CPU_1上写了一个变量可能只写到CPU_1的高速缓存中，那么线程b无论是访问CPU_2的缓存区还是访问主内存，都看不到线程a的写操作。

因此，为了清楚的定义**线程间的操作可见性**，Java专家组制定了Java内存模型。这个模型制定了从宏观到微观的规则，宏观的规则让Java开发者能够不了解底层实现的情况下仍然可以方便地进行并发编程并且得到可预期的结果，微观的规则定义了上层的语义在编译器、处理器级别的行为。

## 线程间的操作可见性

上面提到了线程间的操作可见性，那么这个可见性问题具体是由于什么原因产生的呢？准确的来说，是由于存在以下这三种重排序：

* 编译器优化的重排序。编译器在不改变单线程程序语义的前提下，可以重新安排语句的执行顺序。
* 指令级别的重排序。现代处理器采用了指令级并行技术来将多条指令重叠执行。如果不存在数据依赖性，处理器可以改变语句对应机器指令的执行顺序。
* 内存操作的重排序。由于处理器使用高速缓存，使得加载和存储操作看上去可能是在乱序执行。

第一种和第二种重排序相对容易理解，第三种是什么意思呢？

我们先来学习《深入理解Java内存模型》中的一个例子:

![reorder](/assets/jmm/processor.png)

就是说，如果处理器A及处理器B的指令顺序如上所示，同时A和B并行执行，那么最终可能得到x = y = 0的结果。具体原因图示如下：

![memory](/assets/jmm/memory.png)

首先，处理器A和B把共享变量写入自己的缓冲区（A1和B1），然后从内存中读取另一个共享变量（A2和B2），最后才把自己写缓冲区中保存的脏数据刷新到内存中（A3，B3）。当以这种时序执行时，程序就可以得到x = y = 0的结果。

请注意，**以内存操作实际发生的顺序**来看，直到处理器A执行A3来刷新自己的写缓冲区，写操作A1才算真正执行了。虽然处理器A执行的顺序为：A1 -> A2，但实际内存操作实际发生的顺序却是：A2 -> A1。

因此，由于重排序的存在，线程间存在操作可见性问题。就是说，线程a先执行了某个操作，而线程b随后执行却看不到该操作的结果！

## happens-before规则

为了解决线程间的操作可见性问题，JMM定义了一套happens-before规则，我们可以根据这套规则来编程从而得到可预期的结果。

其中有四条happens-before规则如下：

* 程序顺序规则：一个线程中的每个操作，happens-before于该线程中的任意后续操作
* 监视器锁规则：对一个监视器的解锁，happens-before于随后对这个监视器的加锁
* volatile变量规则：对一个volatile域的写，happens-before于任意后续对这个volatile的读
* 传递性：如果A happens-before B，且B happens-before C，那么A happens-before C。

这四条规则单独看上去没有什么厉害的地方，但是。。。如果综合运用起来呢？

我们还是来看个《深入理解Java内存模型》中的例子吧！

```
class VolatileExample {
	int a = 0;
	volatile boolean flag = false;

	public void writer() {
		a = 1;           //1
		flag = true;     //2
	}

	public void reader() {
		if (flag) {       //3
			int i = a;    //4
			...
		}
	}
}

```

假设线程A执行writer()方法**之后**，线程B执行reader()方法，那么线程B执行4的时候一定能看到线程A写入的值吗？注意，a不是volatile变量。

答案是肯定的。因为根据happens-before规则，我们可以得到如下关系：

1. 根据程序顺序规则，1 happens-before 2；3 happens-before 4。

2. 根据volatile规则，2 happens-before 3。

3. 根据传递性规则，**1 happens-before 4**。

因此，综合运用程序顺序规则、volatile规则及传递性规则，我们可以得到1 happens-before 4，即线程B在执行4的时候一定能看到A写入的值。上述关系图示如下：

![happens-before](/assets/jmm/happens-before.png)

同样的，我们再来看一个锁规则的例子

```
class MonitorExample {
	int a = 0;

	public synchronized void writer() {    //1
		a = 1;                            //2
	}                                     //3

	public synchronized  void reader() {   //4
			int i = a;                    //5
			...
	}                                     //6
}

```

假设线程A执行writer()方法**之后**，线程B执行reader()方法。那么根据happens-before规则，我们可以得到：

1. 根据程序顺序规则，1 happens-before 2，2 happens-before 3；4 happens-before 5，5 happens-before 6。

2. 根据监视器锁规则，3 happens-before 4。

3. 根据传递性规则，**2 happens-before 5**。

上述关系图示如下：

![sync](/assets/jmm/sync.png)


## 总结

本文是对happens-before规则的一个分享总结，《深入理解Java内存模型》中还有很多地方值得学习，大家感兴趣的可以研读下！
