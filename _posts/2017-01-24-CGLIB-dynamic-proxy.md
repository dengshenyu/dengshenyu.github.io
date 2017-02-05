---
layout: post
title: "【译】CGLIB动态代理"
keywords: "Java,CGLIB"
description: "CGLIB动态代理"
date: 2017-01-24 16:00
categories: "Java"
---
> 原文地址[http://jnb.ociweb.com/jnb/jnbNov2005.html](http://jnb.ociweb.com/jnb/jnbNov2005.html)


## CGLIB介绍

代理提供了一个可扩展的机制来控制被代理对象的访问，其实说白了就是在对象访问的时候加了一层封装。JDK从1.3版本起就提供了一个动态代理，它使用起来非常简单，但是有个明显的缺点：需要目标对象实现一个或多个接口。假如你想代理没有接口的类呢？可以使用CGLIB库。

CGLIB是一个强大的、高性能的代码生成库。它被广泛使用在基于代理的AOP框架（例如Spring AOP和dynaop）提供方法拦截。Hibernate作为最流行的ORM工具也同样使用CGLIB库来代理单端关联（集合懒加载除外，它使用另外一种机制）。EasyMock和jMock作为Java流行的Java测试库，提供Mock对象的方式来支持测试，它们都使用了CGLIB对那些没有实现接口的类动态创建代理。

在实现内部，CGLIB库使用了ASM这一个轻量但高性能的字节码操作框架来转化字节码从而产生新类。除了CGLIB，像Groovy和BeanShell这样的脚本语言同样使用ASM来生成Java字节码。ASM使用了一个类似于SAX分析器的机制来达到高性能。我们不建议直接使用ASM，因为这样需要对JVM非常了解，包括类文件格式和指令集。

![cglib-framework](/assets/cglib-dynamic-proxy/cglib-framework.png)

上图展示了与CGLIB库相关框架和语言相互之间的关系。另外提醒下，类似于Spring AOP和Hibernate的框架经常同时使用CGLIB和JDK动态代理来满足各自需要。Hibernate使用JDK动态代理为WebShere应用服务实现了一个事务管理适配器；Spring AOP则默认使用JDK动态代理来代理接口，除非你强制使用CGLIB。

## CGLIB代理API

CGLIB库的代码量不多，但是由于缺乏文档导致学习起来比较困难。2.1.2版本的CGLIB库组织如下所示：

* net.sf.cglib.core：底层字节码操作类；大部分与ASP相关。
* net.sf.cglib.transform：编译期、运行期的class文件转换类。
* net.sf.cglib.proxy：代理创建类、方法拦截类。
* net.sf.cglib.reflect：更快的反射类、C#风格的代理类。
* net.sf.cglib.util：集合排序工具类
* net.sf.cglib。beans：JavaBean相关的工具类

对于创建动态代理，大部分情况下你只需要使用proxy包的一部分API即可。

上面已经提到，CGLIB库是基于ASM的上层应用。对于代理没有实现接口的类，CGLIB非常实用。本质上来说，对于需要被代理的类，它只是动态生成一个子类以覆盖非final的方法，同时绑定钩子回调自定义的拦截器。它比JDK动态代理还要快。

![cglib-uml](/assets/cglib-dynamic-proxy/cglib-uml.png)

CGLIB库中经常用来代理类的API关联图如上所示。net.sf.cglib.proxy.Callback只是一个用于标记的接口，net.sf.cglib.proxy.Enhancer使用的所有回调接口都会继承这个接口。

net.sf.cglib.proxy.MethodInterceptor是最常用的回调类型，在基于代理的AOP实现中它经常被用来拦截方法调用。这个接口只有一个方法：

{% highlight java %}

public Object intercept(Object object, java.lang.reflect.Method method, Object[] args, MethodProxy proxy) throws Throwable;

{% endhighlight %}

如果net.sf.cglib.proxy.MethodInterceptor被设置为一个代理的方法回调，那么当调用这个代理的方法时，它会先调用MethodInterceptor.intercept方法，然后再调用被代理对象的方法，如下图所示。MethodInterceptor.intercept方法的第一个参数是代理对象，第二个、第三个参数分别是被拦截的方法和方法的参数。如果想调用被代理对象的原始方法，可以通过使用java.lang.reflect.Method对象来发射调用，或者使用net.sf.cglib.proxy.MethodProxy对象。我们通常使用net.sf.cglib.proxy.MethodProxy因为它更快。在这个方法中，自定义代码可以在原始方法调用前或调用后注入。

![method-interceptor](/assets/cglib-dynamic-proxy/method-interceptor.png)

net.sf.cglib.proxy.MethodInterceptor满足了所有的代理需求，但对于某些特定场景它可能使用起来不太方便。为了方便使用和高性能，CGLIB提供了另外一些特殊的回调类型。例如，

* net.sf.cglib.proxy.FixedValue：在强制一个特定方法返回固定值场景下非常有用且性能高。
* net.sf.cglib.proxy.NoOp：它直接透传到父类的方法实现。
* net.sf.cglib.proxy.LazyLoader：在被代理对象需要懒加载场景下非常有用，如果被代理对象加载完成，那么在以后的代理调用时会重复使用。
* net.sf.cglib.proxy.Dispatcher：拥有与net.sf.cglib.proxy.LazyLoader一样的方法签名，但每次调用代理方法时都会调用loadObject方法来加载被代理对象。
* net.sf.cglib.proxy.ProxyRefDispatcher：与Dispatcher相同，但它的loadObject方法支持传入代理对象。

我们通常对于被代理类的所有方法都使用同样的回调（如Figure 3所示），但我们也可以使用net.sf.cglib.proxy.CallbackFilter来对不同的方法使用不同的回调。这种细粒度的控制是JDK动态代理没有提供的，也就是java.lang.reflect.InvocationHandler的invoke方法只能应用于被代理对象的所有方法。

除了代理类之外，CGLIB也可以通过java.lang.reflect.Proxy插入替换的方法来代理接口以支持JDK1.3之前的代理方式，但由于这种替换代理的方法很少用，因此这里省略相关的代理API。

现在让我们看看怎么使用CGLIB来创建代理吧。

## 简单代理

CGLIB代理的核心是net.sf.cglib.proxy.Enhancer类。对于创建一个CGLIB代理，你最少得有一个被代理类。现在我们先使用内置的NoOp回调：


{% highlight java %}

/**
 * Create a proxy using NoOp callback. The target class
 * must have a default zero-argument constructor.
 *
 * @param targetClass the super class of the proxy
 * @return a new proxy for a target class instance
 */
public Object createProxy(Class targetClass) {
     Enhancer enhancer = new Enhancer();
     enhancer.setSuperclass(targetClass);
     enhancer.setCallback(NoOp.INSTANCE);
     return enhancer.create();
}

{% endhighlight %}


这个方法的返回值是一个目标类对象的代理。在上面这个例子中，net.sf.cglib.proxy.Enhancer配置了单个net.sf.cglib.proxy.Callback。可以看到，使用CGLIB创建一个简单代理是很容易的。除了创建一个新的net.sf.cglib.proxy.Enhancer对象，你也可以直接使用net.sf.cglib.proxy.Enhancer类中的静态辅助方法来创建代理。但我们更推荐使用例子中的方法，因为你可以通过配置net.sf.cglib.proxy.Enhancer对象来对产生的代理进行更精细的控制。

值得注意的是，我们传入目标类作为代理的父类。不同于JDK动态代理，我们不能使用目标对象来创建代理。目标对象只能被CGLIB创建。在例子中，默认的无参构造方法被使用来创建目标对象。如果你希望CGLIB创建一个有参数的实例，你应该使用net.sf.cglib.proxy.Enhancer.create(Class[], Object[])。该方法的第一个参数指明参数类型，第二个参数指明参数值。参数中的原子类型需要使用包装类。


## 使用MethodInterceptor

我们可以将net.sf.cglib.proxy.NoOp回调替换成自定义的net.sf.cglib.proxy.MethodInterceptor来得到更强大的代理。代理的所有方法调用都会被分派给net.sf.cglib.proxy.MethodInterceptor的intercept方法。intercept方法然后调用底层对象。

假设你想对目标对象的方法调用进行授权检查，如果授权失败，那么抛出一个运行时异常AuthorizationException。接口Authorization.java如下：


{% highlight java %}

package com.lizjason.cglibproxy;

import java.lang.reflect.Method;

/**
 *  A simple authorization service for illustration purpose.
 *
 * @author Jason Zhicheng Li (jason@lizjason.com)
 */
public interface AuthorizationService {
    /**
     * Authorization check for a method call. An AuthorizationException
     * will be thrown if the check fails.
     */
    void authorize(Method method);
}

{% endhighlight %}

接口net.sf.cglib.proxy.MethodInterceptor的实现如下：

{% highlight java %}

package com.lizjason.cglibproxy.impl;

import java.lang.reflect.Method;
import net.sf.cglib.proxy.MethodInterceptor;
import net.sf.cglib.proxy.MethodProxy;
import com.lizjason.cglibproxy.AuthorizationService;

/**
 * A simple MethodInterceptor implementation to
 * apply authorization checks for proxy method calls.
 *
 * @author Jason Zhicheng Li (jason@lizjason.com)
 *
 */
public class AuthorizationInterceptor implements MethodInterceptor {
    private AuthorizationService authorizationService;

    /**
     * Create a AuthorizationInterceptor with the given
     * AuthorizationService
     */
    public AuthorizationInterceptor (AuthorizationService authorizationService) {
        this.authorizationService = authorizationService;
    }

    /**
     * Intercept the proxy method invocations to inject authorization check.
     * The original method is invoked through MethodProxy.
     * @param object the proxy object
     * @param method intercepted Method
     * @param args arguments of the method
     * @param proxy the proxy used to invoke the original method
     * @throws Throwable any exception may be thrown; if so, super method will not be invoked
     * @return any value compatible with the signature of the proxied method.
     */
    public Object intercept(Object object, Method method, Object[] args, MethodProxy methodProxy ) throws Throwable {
        if (authorizationService != null) {
            //may throw an AuthorizationException if authorization failed
            authorizationService.authorize(method);
        }
        return methodProxy.invokeSuper(object, args);
    }
}

{% endhighlight %}

在intercept方法中，先检查授权，如果授权通过，那么intercept方法调用目标对象的方法。由于性能原因，我们使用CGLIB的net.sf.cglib.proxy.MethodProxy对象而不是一般的java.lang.reflect.Method反射对象来调用原始方法。


## 使用CallbackFilter

net.sf.cglib.proxy.CallbackFilter允许你在方法级别设置回调。假设你有一个PersistenceServiceImpl类，它有两个方法：save和load。save方法需要进行授权检查，而load方法不需要。


{% highlight java %}

package com.lizjason.cglibproxy.impl;

import com.lizjason.cglibproxy.PersistenceService;

/**
 * A simple implementation of PersistenceService interface
 *
 * @author Jason Zhicheng Li (jason@lizjason.com)
 */
public class PersistenceServiceImpl implements PersistenceService {

    public void save(long id, String data) {
        System.out.println(data + " has been saved successfully.");
    }

    public String load(long id) {
        return "Jason Zhicheng Li";
    }
}

{% endhighlight %}

PersistenceServiceImpl类实现了PersistenceService接口，但这个不是必须的。PersistenceServiceImpl的net.sf.cglib.proxy.CallbackFilter实现如下：

{% highlight java %}

package com.lizjason.cglibproxy.impl;

import java.lang.reflect.Method;
import net.sf.cglib.proxy.CallbackFilter;

/**
 * An implementation of CallbackFilter for PersistenceServiceImpl
 *
 * @author Jason Zhicheng Li (jason@lizjason.com)
 */
public class PersistenceServiceCallbackFilter implements CallbackFilter {

    //callback index for save method
    private static final int SAVE = 0;

    //callback index for load method
    private static final int LOAD = 1;

    /**
     * Specify which callback to use for the method being invoked.
     * @method the method being invoked.
     * @return the callback index in the callback array for this method
     */
    public int accept(Method method) {
        String name = method.getName();
        if ("save".equals(name)) {
            return SAVE;
        }
        // for other methods, including the load method, use the
        // second callback
        return LOAD;
    }
}

{% endhighlight %}

accept方法将代理方法映射到回调。方法返回值是一个回调数组中的下标。下面是PersistenceServiceImpl的代理创建实现：

{% highlight java %}

...
Enhancer enhancer = new Enhancer();
enhancer.setSuperclass(PersistenceServiceImpl.class);

CallbackFilter callbackFilter = new PersistenceServiceCallbackFilter();
enhancer.setCallbackFilter(callbackFilter);

AuthorizationService authorizationService = ...
Callback saveCallback = new AuthorizationInterceptor(authorizationService);
Callback loadCallback = NoOp.INSTANCE;
Callback[] callbacks = new Callback[]{saveCallback, loadCallback };
enhancer.setCallbacks(callbacks);
...
return (PersistenceServiceImpl)enhancer.create();

{% endhighlight %}

在例子中，AuthorizationInterceptor应用于save方法，NoOp.INSTANCE应用于load方法。另外说下，你可以通过net.sf.cglib.proxy.Enhancer.setInterfaces(Class[])指明代理需要实现的接口，但这个不是必须的。

对于net.sf.cglib.proxy.Enhancer，除了设置一个回调对象数组，你也可以使用net.sf.cglib.proxy.Enhancer.setCallbackTypes(Class[])设置一个回调类型数组。在代理创建过程中如果你没有实际的回调对象，那么这种方法非常有用。像回调对象一样，你也需要使用net.sf.cglib.proxy.CallbackFilter来指明每个拦截方法的回调类型下标。你可以从[ http://www.lizjason.com/downloads/](http://www.lizjason.com/downloads/)下载完整的样例代码。

## 总结

CGLIB是一个强大的高性能的代码生成库。作为JDK动态代理的互补，它对于那些没有实现接口的类提供了代理方案。在底层，它使用ASM字节码操纵框架。本质上来说，CGLIB通过产生子类覆盖非final方法来进行代理。它比使用Java反射的JDK动态代理方法更快。CGLIB不能代理一个final类或者final方法。通常来说，你可以使用JDK动态代理方法来创建代理，对于没有接口的情况或者性能因素，CGLIB是一个很好的选择。

## 参考

* [Complete source code for this article](http://www.lizjason.com/downloads/)
* [CGLIB library](http://cglib.sourceforge.net)
* [Spring Framework](http://www.springframework.org)
* [JDK dynamic proxy](http://java.sun.com/j2se/1.5.0/docs/api/java/lang/reflect/Proxy.html)
* [EasyMock](http://www.easymock.org)
* [jMock](http://www.jmock.org)
* [dynaop](http://dynaop.dev.java.net)
[A good introduction to ASM by Eugene Kuleshov](http://www.onjava.com/lpt/a/5250)





























