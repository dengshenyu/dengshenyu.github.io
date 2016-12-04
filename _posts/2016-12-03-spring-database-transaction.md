---
layout: post
title: "Spring数据库事务"
keywords: "Java,Spring,数据库"
description: "Spring数据库事务"
date: 2016-12-03 17:00
categories: ["Java", "Spring"]
---

数据库是项目开发过程中必不可少的一个组件，而数据库事务则是核心流程中经常使用的一种技术。我们来聊一聊Spring中与数据库事务相关的一些技术细节。

目录

* [事务性质](#transactionProperty)
* [事务隔离级别](#isolation)
   * [脏读](#dirtyRead)
   * [不可重复读](#nonRepeatableRead)
   * [幻读](#phantomRead)
   * [隔离级别与读现象](#isolationAndRead)
* [Spring数据库事务抽象](#abstraction)
* [Spring数据库事务使用](#use)
   * [基于xml的事务配置](#xmlBased)
   * [基于注解的事务配置](#annotationBased)
   * [事务属性配置](#propertyConfig)
      * [事务回滚](#rollback)
      * [事务传播](#propagation)
* [总结](#summary)

## <a name="transactionProperty"></a>事务性质

首先我们来看下数据库事务的基本性质，概括起来即ACID性质：

* 原子性(Atomicity)：要么全做，要么全部不做。也就是说，如果事务成功提交则它的操作全部完成，相反如果事务失败回滚则它的操作全部撤销。

* 一致性(Consistency)：在事务前后数据库始终处于一致性状态。这意味着在事务执行过程中，数据库完整性都不会被破坏。

* 隔离性(Isolation)：保证事务不受其他并发事务影响。隔离程度从弱到强可以分为四个级别，Read Uncommitted、Read Committed、Read Repeatable和Serializable。下文做进一步讨论。

* 持久性(Durability)：事务完成后，改变是永久的。也就是说，事务成功提交后，它的操作无论如何都不会被**撤销**。

## <a name="isolation"></a>事务隔离级别

我们先了解下几个读现象：脏读、不可重复读、幻读。

为了方便说明，先定义一张数据库表users，它有如下两行记录：

| id | name | age |
|----|------|-----|
| 1 | Joe | 20 |
| 2 | Jill | 25 |


### <a name="dirtyRead"></a>脏读

脏读指一个事务能够读到其他事务还没提交的操作。

假如有两个事务并发执行，如下所示：

![dirty-read](/assets/spring-database-transaction/dirty-read.png)


事务2改变了数据但还**没有**提交，这时候事务1读到了事务2还没有提交的数据。假如事务2回滚了，那么事务1看到的数据视图是错误的。

### <a name="nonRepeatableRead"></a>不可重复读

不可重复读指在一个事务执行过程中，一行记录被读取两次但在这两次读取中这行记录的数据不相同。

假如有两个事务并发执行，如下所示：

![non-repeatable-read](/assets/spring-database-transaction/non-repeatable-read.png)

例子中事务2成功提交，意味着它对id为1的记录的改动生效。而对于事务1来说，它在两次读取中看到了该记录不同的age值。

### <a name="phantomRead"></a>幻读

幻读指在一个事务执行过程中，有两次相同的查询，但第二次看到数据集合比第一次多，看到了幽灵般出现的新数据。

假如有两个事务并发执行，如下所示：

![phantom-read](/assets/spring-database-transaction/phantom-read.png)

例子中事务1执行了两次相同的查询，在第二次查询看到了事务2新插入并提交的数据。

这里我们对**不可重复读**和**幻读**加以区分：**不可重复读**指事务原先所读到的数据被修改或删除了，不可重复读取；而**幻读**则指事务在执行相同查询时读到了新增加的数据，读到幻象般出现的数据。

### <a name="isolationAndRead"></a>隔离级别与读现象

隔离级别从弱到强可以分为四个等级，Read Uncommitted、Read Committed、Read Repeatable和Serializable。

隔离级别与读现象联系如下：

![isolation](/assets/spring-database-transaction/isolation.png)

从上图可以看出，Read Uncommitted隔离程度最弱，三种读现象都可能发生；而Serializable隔离程度最强，这三种读现象都不会发生。


## <a name="abstraction"></a>Spring数据库事务抽象

在对Spring数据库事务做进一步讨论前，我们先通过Spring的一个事务管理接口了解事务整体抽象：


{% highlight java %}

public interface PlatformTransactionManager {

    TransactionStatus getTransaction(
            TransactionDefinition definition) throws TransactionException;

    void commit(TransactionStatus status) throws TransactionException;

    void rollback(TransactionStatus status) throws TransactionException;
}

{% endhighlight %}


**PlatformTransactionManager**有三个方法，分别用于获取事务、提交事务和回滚事务。

对于获取事务的**getTransaction(..)**接口，其参数为**TransactionDefinition**，用于表示我们希望获取什么样的事务；返回值为**TransactionStatus**，代表一个事务，我们可以通过它来控制事务执行以及获取事务状态。

**TransactionDefinition**定义了如下属性：

* Isolation：事务隔离级别
* Propagation：事务传播类型
* Timeout：事务执行的超时时间
* Read-Only：事务是否为只读

对于这些属性含义下文会做进一步讨论，现在只需要知道一个整体概念。


目前项目的数据库datasource有不同的实现，譬如JDBC、Hibernate、JTA等等，因此PlatformTransactionManager也有不同的实现。

以下为定义一个JDBC datasource并且使用相应的事务管理器：

{% highlight xml %}

<bean id="dataSource" class="org.apache.commons.dbcp.BasicDataSource" destroy-method="close">
    <property name="driverClassName" value="${jdbc.driverClassName}" />
    <property name="url" value="${jdbc.url}" />
    <property name="username" value="${jdbc.username}" />
    <property name="password" value="${jdbc.password}" />
</bean>

<bean id="txManager" class="org.springframework.jdbc.datasource.DataSourceTransactionManager">
    <property name="dataSource" ref="dataSource"/>
</bean>

{% endhighlight  %}

## <a name="use"></a>Spring数据库事务使用

了解了一个整体抽象后，现在我们来研究怎么启用Spring数据库事务。

我们可以通过**代码编程方式**和**声明方式**来使用Spring数据库事务，但在大多数情况下都使用声明方式来使用事务，因此这里只讨论声明方式的具体细节。

### <a name="xmlBased"></a>基于xml的事务配置

在实际配置前，我们先了解下Spring实现声明式事务的整体框架。

Spring在声明式事务上使用了[AOP代理](http://docs.spring.io/spring-framework/docs/4.2.x/spring-framework-reference/html/aop.html#aop-understanding-aop-proxies)来实现，如下所示：

![aop-proxy](/assets/spring-database-transaction/proxy.png)

如上图，Target Method为我们写的一个类方法，并使用了声明式事务。当我们在[IOC容器](http://docs.spring.io/spring/docs/current/spring-framework-reference/html/beans.html)中通过依赖注入获取该类的实例时，我们获取到的其实是一个AOP代理。当我们调用该Target Method时，其实是先调用了一个AOP代理的方法，AOP代理通过使用**Transaction advisor**和**PlatformTransactionManager**来实现事务，最后才调用了Target Method。

现在来看个具体例子。

我们有一个FooService接口和其实现：

{% highlight java %}

package x.y.service;

public interface FooService {

    Foo getFoo(String fooName);

    Foo getFoo(String fooName, String barName);

    void insertFoo(Foo foo);

    void updateFoo(Foo foo);

}

{% endhighlight %}



{% highlight java %}

package x.y.service;

public class DefaultFooService implements FooService {

    public Foo getFoo(String fooName) {
		//...getFoo...
    }

    public void insertFoo(Foo foo) {
		//...insertFoo...
    }


    public void updateFoo(Foo foo) {
		//...updateFoo...
    }

}

{% endhighlight %}

而事务配置如下：

{% highlight xml %}

<!-- from the file 'context.xml' -->
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:aop="http://www.springframework.org/schema/aop"
    xmlns:tx="http://www.springframework.org/schema/tx"
    xsi:schemaLocation="
        http://www.springframework.org/schema/beans
        http://www.springframework.org/schema/beans/spring-beans.xsd
        http://www.springframework.org/schema/tx
        http://www.springframework.org/schema/tx/spring-tx.xsd
        http://www.springframework.org/schema/aop
        http://www.springframework.org/schema/aop/spring-aop.xsd">

    <!-- this is the service object that we want to make transactional -->
    <bean id="fooService" class="x.y.service.DefaultFooService"/>

    <!-- the transactional advice (what 'happens'; see the <aop:advisor/> bean below) -->
    <tx:advice id="txAdvice" transaction-manager="txManager">
        <!-- the transactional semantics... -->
        <tx:attributes>
            <!-- all methods starting with 'get' are read-only -->
            <tx:method name="get*" read-only="true"/>
            <!-- other methods use the default transaction settings (see below) -->
            <tx:method name="*"/>
        </tx:attributes>
    </tx:advice>

    <!-- ensure that the above transactional advice runs for any execution
        of an operation defined by the FooService interface -->
    <aop:config>
        <aop:pointcut id="fooServiceOperation" expression="execution(* x.y.service.FooService.*(..))"/>
        <aop:advisor advice-ref="txAdvice" pointcut-ref="fooServiceOperation"/>
    </aop:config>

    <!-- don't forget the DataSource -->
    <bean id="dataSource" class="org.apache.commons.dbcp.BasicDataSource" destroy-method="close">
        <property name="driverClassName" value="oracle.jdbc.driver.OracleDriver"/>
        <property name="url" value="jdbc:oracle:thin:@rj-t42:1521:elvis"/>
        <property name="username" value="scott"/>
        <property name="password" value="tiger"/>
    </bean>

    <!-- similarly, don't forget the PlatformTransactionManager -->
    <bean id="txManager" class="org.springframework.jdbc.datasource.DataSourceTransactionManager">
        <property name="dataSource" ref="dataSource"/>
    </bean>

    <!-- other <bean/> definitions here -->

</beans>

{% endhighlight %}

配置貌似有点复杂，不要慌，我们来一行行解析。

这里声明了一个fooService对象，希望它使用事务。

我们定义了一个事务语义**\<tx:advice/>**，它可以理解成这样：所有以‘get’开头的方法都执行在一个**只读**的事务中，其他的方法则执行在默认配置的事务中。**\<tx:advice/>**的transaction-manager属性指明了用来管理事务的PlatformTransactionManager。

**\<aop:config/>**则定义事务语义txAdvice在程序中什么地方执行。在**\<aop:config/>**中我们先定义了一个匹配FooService接口任何操作的**pointcut**，然后通过**advisor**将该**pointcut**关联到txAdvice。

综合起来就是，在执行FooService接口任何操作时，使用由txAdvice定义的事务。

advice、advisor、pointcut这些概念理解起来有点晕？

其实，poincut描述在什么地方，advice描述做什么事情，advisor则将pointcut和advice结合起来，描述了在什么地方执行什么事情。这样理解是不是好多了？:)

在具体实现上，通过以上声明配置Spring其实对**FooService**包装了一个AOP代理，该AOP代理配置使用了相应事务advice。当我们调用**FooService**的方法时，其实调用了该AOP代理，代理创建使用事务，并标识成事务只读，最终调用**FooService**的方法。


### <a name="annotationBased"></a>基于注解的事务配置

上面介绍了使用xml声明方式来使用事务，我们也可以使用基于注解的方式。

使用事务注解的类定义：

{% highlight java %}

@Transactional
public class DefaultFooService implements FooService {

    Foo getFoo(String fooName);

    Foo getFoo(String fooName, String barName);

    void insertFoo(Foo foo);

    void updateFoo(Foo foo);
}

{% endhighlight %}

在xml中启用注解：

{% highlight xml %}

<!-- from the file 'context.xml' -->
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:aop="http://www.springframework.org/schema/aop"
    xmlns:tx="http://www.springframework.org/schema/tx"
    xsi:schemaLocation="
        http://www.springframework.org/schema/beans
        http://www.springframework.org/schema/beans/spring-beans.xsd
        http://www.springframework.org/schema/tx
        http://www.springframework.org/schema/tx/spring-tx.xsd
        http://www.springframework.org/schema/aop
        http://www.springframework.org/schema/aop/spring-aop.xsd">

    <!-- this is the service object that we want to make transactional -->
    <bean id="fooService" class="x.y.service.DefaultFooService"/>

    <!-- enable the configuration of transactional behavior based on annotations -->
    <tx:annotation-driven transaction-manager="txManager"/><!-- a PlatformTransactionManager is still required -->
    <bean id="txManager" class="org.springframework.jdbc.datasource.DataSourceTransactionManager">
        <!-- (this dependency is defined somewhere else) -->
        <property name="dataSource" ref="dataSource"/>
    </bean>

    <!-- other <bean/> definitions here -->

</beans>

{% endhighlight %}


可以看到，这种基于注解的事务方式比上面基于xml的事务方式少了AOP配置，我们只需要另外增加一行**\<tx:annotation-driven .../>**就可以了。


### <a name="propertyConfig"></a>事务属性配置

无论基于xml还是基于注解，事务属性除了是否只读还有其他一些属性。上面配置中我们没有具体指明这些属性值，其实是使用了这些属性的默认值：

* Propagation：默认为REQUIRED
* Isolation：默认为DEFAULT
* Read-Only：默认为false
* Timeout：默认为底层数据库超时时间
* Rollback-for：RuntimeException

我们可以改变这些属性默认值。这些属性是依赖<tx:method/>来设定的，总结如下：

|-----------------+----------+-----------+------|
| 属性            | 是否必要 | 默认      | 描述 |
|:----------------|:--------:|:---------:|:-----|
| name            | 是       |           | 事务属性关联的方法名 |
| propagation     | 否       | REQUIRED  | 事务传播行为 |
| isolation       | 否       | DEFAULT   | 事务隔离级别 |
| timeout         | 否       | -1        | 事务超时时间（单位秒）|
| read-only       | 否       | false     | 事务是否只读 |
| rollback-for    | 否       |           | 导致事务回滚的异常；以逗号分割。|
| no-rollback-for | 否       |           | 不导致事务回滚的异常；以逗号分割。 |
|=================+============+=================+================|

<br>


其中，Rollback(rollback-for、no-rollback-for)和Propagation有些细节需要额外注意，下面做些探讨。

#### <a name="rollback"></a>事务回滚(Rollback)

Spring建议的做法是，我们通过抛出异常方式来回滚事务。当抛出异常时，Spring事务框架会捕获异常，决定是否回滚事务，然后再重新抛出该异常。

在默认情况下，Spring事务框架只会对于**RuntimeException**和**Error**回滚事务，其他异常则不会回滚事务。

我们可以指定异常类型**回滚**或**不回滚**事务，如下所示：

{% highlight java %}

<tx:advice id="txAdvice" transaction-manager="txManager">
    <tx:attributes>
    <tx:method name="get*" read-only="true" rollback-for="NoProductInStockException"/>
    <tx:method name="*"/>
    </tx:attributes>
</tx:advice>


<tx:advice id="txAdvice">
    <tx:attributes>
    <tx:method name="updateStock" no-rollback-for="InstrumentNotFoundException"/>
    <tx:method name="*"/>
    </tx:attributes>
</tx:advice>

{% endhighlight %}

<br>

#### <a name="propagation"></a>事务传播(Propagation)

事务传播指的是，多个使用事务的方法存在相互调用时，各自的事务是怎么相互影响的。

下面是事务传播的行为：

| 行为 | 描述 |
| MANDATORY | 使用当前已存在的事务，如果当前没有处于事务中则抛出异常 |
| NEVER | 以非事务方式执行，如果当前已经处于一个事务中则抛出异常 |
| NOT_SUPPORTED | 以非事务方式执行，如果当前已经处于一个事务中则挂起该事务 |
| REQUIRED | 使用当前已存在的事务，如果没有则创建一个新事务 |
| REQUIRES_NEW | 创建一个新事务，如果当前已处于一个事务中则挂起该事务 |
| SUPPORTS | 使用当前已存在的事务，没有则以非事务方式执行 |
| NESTED | 如果当前已经处于一个事务中则在一个嵌套事务中执行，如果没有则创建一个新事务 |

举个例子，假如存在两个使用**Propagation.REQUIRED**事务的方法，它们调用关系如下：

![required](/assets/spring-database-transaction/required.png)

当我们调用方法1时，会创建一个新事务；方法1调用方法2时，使用当前事务。当方法1最终返回时，整个事务才会提交或者回滚。

这意味着，在方法2抛出异常或者设置回滚状态会影响方法1的事务提交，因为它们本质上属于同一个事务。

再举个例子。假如存在两个使用Propagation.REQUIRES_NEW事务的方法，它们调用关系如下：

![requires-new](/assets/spring-database-transaction/requires-new.png)

但我们调用方法1时，创建一个新事务；当方法1调用方法2时，会挂起方法1中的事务，创建一个新事务并执行。当方法2返回时，方法2的事务提交或回滚；当方法1返回时，方法1的事务提交或回滚。方法1和方法2的事务相互独立不受相互影响。


## <a name="summary"></a>总结

本文从数据库事务性质到Spring数据库事务支持进行了一些技术探讨，如有纰漏恳请指出。

下面是一个实际项目当中经常会遇到的一个坑。

假如有一个FooService服务，它有两个方法func1和func2，func2使用事务，func1调用func2。如下所示：

![question](/assets/spring-database-transaction/example.png)

那么当我们调用FooService.func1时，func2的事务配置会生效么？

<br>

答案是不会。如前文所述，Spring数据库事务是AOP代理实现的，当我们调用func1时，其实是调用AOP代理，由于func1没有使用事务，因此这时候AOP代理不会创建使用事务；而func1调用func2时，这时候其实并**没有**经过AOP代理而是直接调用，因此也不会生成所希望的事务。:)










