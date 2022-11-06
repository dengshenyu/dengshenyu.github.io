---
layout: post
title: "Java并发基础（一）"
keywords: "Java, 并发, concurrency"
description: "Java并发基础"
date: 2017-04-12 22:00
categories: "Java"
---

说到Java的并发，便离不开java.util.concurrent这个包。这个包封装了Java并发相关的类，我们可以基于这些类构建出并发安全且高性能的上层应用。

java.util.concurrent主要包含三部分：1）提供原子性操作的类；2）锁；3）基于原子操作类以及锁构建的数据结构。

本篇文章讨论Java中提供原子性操作的类，这些类都放在java.util.concurrent.atomic这个子包下面。

其实，java.util.concurrent.atomic这个包只是提供了一些工具类，而这些工具类在多线程共享及操作变量上非常有用。更重要的是，这些工具类提供的线程安全操作往往是无锁的。atomic工具类是对volatile变量的一个延伸，它们都提供了这么一个原子性条件更新操作：

{% highlight java %}

boolean compareAndSet(expectedValue, updateValue);

{% endhighlight %}

这个方法先判断该变量当前的值是否是expectedValue，如果是则更新成updateValue并且返回true，否则直接返回false。这个过程是原子性的。当然，除此之外这些工具类还包括获取值、非条件更新、弱化条件更新等方法。

这些方法的底层实现往往使用处理器支持的原子性指令来达到无锁的目的，但对于不支持这些指令的系统，这些方法可能会采取一些基于锁的手段。因此，它们都没有严格声明为非阻塞的，也就是说一个线程在调用compareAndSet方法时可能会被串行化等待。

[AtomicBoolean](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicBoolean.html)，[AtomicInteger](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicInteger.html)，[AtomicLong](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicLong.html)以及[AtomicReference](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicReference.html)这几个类提供了常用类型的原子性访问及更新操作，并且这些类基于这些操作封装了一些非常有用的工具方法。

举个例子，AtomicLong和AtomicInteger提供了原子性递增的工具方法，基于这个方法我们可以很方便地实现一个线程安全的序列号产生器：

{% highlight java %}

class Sequencer {
  private final AtomicLong sequenceNumber
    = new AtomicLong(0);
  public long next() {
    return sequenceNumber.getAndIncrement();
  }
}

{% endhighlight %}

有了compareAndSet这个法宝，我们也可以非常方便地定义自己的工具方法。假设当前存在一个转换操作：

{% highlight java %}

long transform(long input)

{% endhighlight %}

我们可以将该变量的更新过程变成线程安全的：


{% highlight java %}

long getAndTransform(AtomicLong var) {
  long prev, next;
  do {
    prev = var.get();
    next = transform(prev);
  } while (!var.compareAndSet(prev, next));
  return prev; // return next; for transformAndGet
}

{% endhighlight %}

在内存可见性上面，这些原子性操作类的访问及更新操作与volatile变量产生相同的内存影响（关于volatile的内存可见性感兴趣的可以看下[The Java Language Specification (17.4 Memory Model)](https://docs.oracle.com/javase/specs/jls/se7/html/jls-17.html#jls-17.4)，总结为如下几点：

* get操作相当于读volatile变量。
* set操作相当于写volatile变量。
* lazySet相当于写volatile变量除了它允许与之后的内存操作重排序（但保证与之前的操作的顺序性）。
* weakCompareAndSet原子性条件读写变量，但不创建任何happens-before顺序，也就是说该操作只是对其目标变量有影响，对操作前后的其他变量读写没有任何影响。

下面对这几句话做个简单的解释。

我们将一个变量声明为volatile，在读写该变量时我们不仅仅获得了内存操作的实时可见性，同时这些读写操作与操作前后的其他变量指令也有一定顺序性。

顺序性是什么意思？难道我写的代码不是按顺序从前往后执行的？

嗯的确不是。为了程序代码有更快的执行性能，代码在编译的时候编译器会进行优化，会对指令进行重排序；而CPU在执行机器指令的时候也会进行重排序以得到更好的并行度。

这些重排序优化为保证结果正确性，会遵循一个前提：不改变单线程执行语义。也就是说，只要保证我们的代码在单线程下执行结果是正确的，那么指令重排序是可允许的。

举个简单的例子，假如我们的代码如下：

{% highlight java %}

int a = 5;     //1
int b = 6;     //2
int c = a + b; //3

{% endhighlight %}

在上面的代码中，假如编译器把1和2换个顺序执行，先执行代码2再执行代码1，最终c仍然可以得到正确的结果。

但在多线程情况下，这些重排序往往会让程序结果不可预测。因此为了保证多线程情况下的行为可预期，Java专家组制定了[Java内存模型](http://www.cs.umd.edu/~pugh/java/memoryModel/)规范。这个规范在上层向我们保证了特定语义（譬如volatile、监视器锁）的上下文顺序性，而在底层实现中通过使用内存屏障(Memory Barrier)指令来保证指令顺序。

对于上下文顺序性，我之前整理过[一篇文章](http://nahai.me/%E5%90%8E%E7%AB%AF%E6%8A%80%E6%9C%AF/2016/05/01/jmm-happens-before.html)介绍这些happens-before规则，这里不再赘述。

这里简单介绍下底层实现中的内存屏障。

代码执行无非就是读（Load）和写（Store），为了保证读写顺序性以及内存操作全局可见性，代码编译之后会在适当位置插入内存屏障指令。四种内存屏障指令描述如下：

1） LoadLoad屏障

序列：Load1, LoadLoad, Load2

作用：确保Load1所要读入的数据能够在Load2和后续指令访问前读入

2）StoreStore屏障

序列：Store1, StoreStore, Store2

作用：确保Store1的数据在Store2以及后续Store指令操作相关数据之前对其它处理器可见

3）LoadStore屏障

序列：Load1, LoadStore, Store2

作用：确保Load1的数据在Store2和后续Store指令被刷新之前读取

4）StoreLoad屏障

序列：Store1, StoreLoad, Load2

作用：确保Store1的数据在被Load2和后续的Load指令读取之前对其他处理器可见

下图显示了前后两步操作中间的内存屏障情况：

![memory-barrier](/assets/java-concurrency-1/memory-barrier.png)

其中，Normal表示普通变量，Volatile表示volatile变量，Monitor表示对象监视器锁。

现在我们再回到上面提到的原子性操作类的lazySet方法。它相当于写volatile变量除了它允许与之后的内存操作重排序（但保证与之前的操作的顺序性），其实说白了就是，它省略了StoreLoad指令。对于一个Volatile变量来说，当我们对其进行读写时，在它写之后、读之前会插入StoreLoad屏障以保证多CPU场景下读操作能读到写的值。但是这个StoreLoad指令开销非常昂贵，因此在lazySet中省略了这个StoreLoad屏障。

这样一来，我们获得了更好的执行性能，但造成的结果是多线程情况下另一个线程不一定能看到lazySet的值。那这个lazySet有什么用呢？一个主要的使用场景是，如果某些变量没有用了，为了避免长期的内存占用我们将其lazySet为null，但仍然让其他线程暂时看到其原来的值，直到有别的同步操作将该null值刷新回内存使得对其他线程可见。

在java.util.concurrent.atomic包中，除了有AtomicInteger这些操作单个值的类，还包含有不同类型的Updater类，这些类可以用来实现任何类的任何volatile字段的compareAndSet操作。这些Updater类目前有：[AtomicReferenceFieldUpdater](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicReferenceFieldUpdater.html)，[AtomicIntegerFieldUpdater](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicIntegerFieldUpdater.html)，[AtomicLongFieldUpdater](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicLongFieldUpdater.html)。它们是基于反射机制来访问相应类的字段的，这样做的缺点是代价相对比较昂贵，但是可以让我们得到非常好的灵活性。就是说，我们不需要一开始就要决定是否使用AtomicInteger，可以先使用volatile int，后面实在需要原子性的条件更新时可以使用AtomicIntegerFieldUpdater来包装控制。

[AtomicIntegerArray](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicIntegerArray.html)，[AtomicLongArray](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicLongArray.html)，[AtomicReferenceArray](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicReferenceArray.html)这三个类支持数组类型的原子性操作，它们提供了数组元素的volatile访问语义。

你可能会问，将数组声明为volatile（例如volatile int[]）不就行了么，为啥还要AtomicIntegerArray？

这是行不通的。volatile的数组只对数组的引用具有volatile的语义，而不是它的元素。大家可以参考下[这篇文章](http://ifeve.com/volatile-array-visiblity/)。

另外，atomic包里有一个[AtomicMarkableReference](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicMarkableReference.html)类，这个类将一个boolean变量与一个引用关联起来。举个使用例子，我们可以在相关数据结构中使用这个boolean变量来表示其关联的对象已经被逻辑删除了。而[AtomicStampedReference](http://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicStampedReference.html)则将一个整数关联到一个引用。这个则可以被用来表示关联对象更新的版本号。

最后提醒下，原子类主要用来构造非阻塞的数据结构，其compareAndSet方法不是锁的替代方案，但它在单个变量的关键更新及同步上非常有用。原子类也不是java.lang.Integer这些类的替代方案，我们要具体场景具体分析。另外，这些原子类并没有定义equals、hashCode、compareTo这些方法，因为原子类的对象预期是变化的，它们不能作为HashMap这些结构的键值使用。


参考资料

* [Package java.util.concurrent.atomic](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/package-summary.html)
* [Java Memory Model](https://docs.oracle.com/javase/specs/jls/se7/html/jls-17.html#jls-17.4)
* [Java内存模型Cookbook（二）内存屏障](http://ifeve.com/jmm-cookbook-mb/)
* [AtomicInteger lazySet vs. set](http://stackoverflow.com/questions/1468007/atomicinteger-lazyset-vs-set)
* [volatile是否能保证数组中元素的可见性？](http://ifeve.com/volatile-array-visiblity/)
