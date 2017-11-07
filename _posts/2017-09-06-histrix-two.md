---
layout: post
title: "Hystrix：分布式系统的高性能及高可用解决方案（二）"
keywords: "hystrix"
description: "Hystrix：分布式系统的高性能及高可用解决方案（二）"
date: 2017-09-06 00:25
categories: "Java"
---

[Hystrix：分布式系统的高性能及高可用解决方案（一）](http://www.dengshenyu.com/java/2017/08/30/histrix.html)

## 请求缓存

对于HystrixCommand和HystrixObservableCommand，我们可以通过实现[getCacheKey()](http://netflix.github.io/Hystrix/javadoc/com/netflix/hystrix/HystrixCommand.html#getCacheKey)来实现请求缓存：

{% highlight java %}

public class CommandUsingRequestCache extends HystrixCommand<Boolean> {

    private final int value;

    protected CommandUsingRequestCache(int value) {
        super(HystrixCommandGroupKey.Factory.asKey("ExampleGroup"));
        this.value = value;
    }

    @Override
    protected Boolean run() {
        return value == 0 || value % 2 == 0;
    }

    @Override
    protected String getCacheKey() {
        return String.valueOf(value);
    }
}

{% endhighlight %}


因为这个依赖请求上下文，我们需要初始化[HystrixRequestContext](http://netflix.github.io/Hystrix/javadoc/com/netflix/hystrix/strategy/concurrency/HystrixRequestContext.html)，在单元测试中我们可以这样做：

{% highlight java %}

@Test
public void testWithoutCacheHits() {
    HystrixRequestContext context = HystrixRequestContext.initializeContext();
    try {
        assertTrue(new CommandUsingRequestCache(2).execute());
        assertFalse(new CommandUsingRequestCache(1).execute());
        assertTrue(new CommandUsingRequestCache(0).execute());
        assertTrue(new CommandUsingRequestCache(58672).execute());
    } finally {
        context.shutdown();
    }
}

{% endhighlight %}

下面这个例子展示了如何从缓存中读取值（以及判断该值是否来自缓存）：

{% highlight java %}

@Test
public void testWithCacheHits() {
    HystrixRequestContext context = HystrixRequestContext.initializeContext();
    try {
        CommandUsingRequestCache command2a = new CommandUsingRequestCache(2);
        CommandUsingRequestCache command2b = new CommandUsingRequestCache(2);

        assertTrue(command2a.execute());
        // 第一次执行command（value为2），不从缓存中读取
        assertFalse(command2a.isResponseFromCache());

        assertTrue(command2b.execute());
        // 第二次执行该command，从缓存中读取值
        assertTrue(command2b.isResponseFromCache());
    } finally {
        context.shutdown();
    }

    // 初始化新的请求上下文
    context = HystrixRequestContext.initializeContext();
    try {
        CommandUsingRequestCache command3b = new CommandUsingRequestCache(2);
        assertTrue(command3b.execute());
        // 由于为新的请求上下文，因此不从缓存中读取值
        assertFalse(command3b.isResponseFromCache());
    } finally {
        context.shutdown();
    }
}

{% endhighlight %}


## 请求折叠

请求折叠可以使得多个请求在一个HystrixCommand中执行，折叠器（collapser）根据时间窗口或者批量上限来触发创建批量处理请求。

Hystrix支持两种请求折叠，一种为request-scoped，另一种为globally-scoped。在创建折叠器时，我们可以指定哪种类型，默认为request-scoped。request-scoped的折叠器根据HystrixRequestContext来创建批量处理，而globally-scoped的折叠器则会跨越多个HystrixRequestContext来创建上下文。

以下为实现request-scoped折叠器的样例代码：

{% highlight java %}

public class CommandCollapserGetValueForKey extends HystrixCollapser<List<String>, String, Integer> {

    private final Integer key;

    public CommandCollapserGetValueForKey(Integer key) {
        this.key = key;
    }

    @Override
    public Integer getRequestArgument() {
        return key;
    }

    @Override
    protected HystrixCommand<List<String>> createCommand(final Collection<CollapsedRequest<String, Integer>> requests) {
        return new BatchCommand(requests);
    }

    @Override
    protected void mapResponseToRequests(List<String> batchResponse, Collection<CollapsedRequest<String, Integer>> requests) {
        int count = 0;
        for (CollapsedRequest<String, Integer> request : requests) {
            request.setResponse(batchResponse.get(count++));
        }
    }

    private static final class BatchCommand extends HystrixCommand<List<String>> {
        private final Collection<CollapsedRequest<String, Integer>> requests;

        private BatchCommand(Collection<CollapsedRequest<String, Integer>> requests) {
                super(Setter.withGroupKey(HystrixCommandGroupKey.Factory.asKey("ExampleGroup"))
                    .andCommandKey(HystrixCommandKey.Factory.asKey("GetValueForKey")));
            this.requests = requests;
        }

        @Override
        protected List<String> run() {
            ArrayList<String> response = new ArrayList<String>();
            for (CollapsedRequest<String, Integer> request : requests) {
                // 这里模拟请求返回值
                response.add("ValueForKey: " + request.getArgument());
            }
            return response;
        }
    }
}


{% endhighlight %}


以下单元测试展示了如何使用折叠器将4个CommandCollapserGetValueForKey折叠到一个HystrixCommand中执行：


{% highlight java %}

@Test
public void testCollapser() throws Exception {
    HystrixRequestContext context = HystrixRequestContext.initializeContext();
    try {
        Future<String> f1 = new CommandCollapserGetValueForKey(1).queue();
        Future<String> f2 = new CommandCollapserGetValueForKey(2).queue();
        Future<String> f3 = new CommandCollapserGetValueForKey(3).queue();
        Future<String> f4 = new CommandCollapserGetValueForKey(4).queue();

        assertEquals("ValueForKey: 1", f1.get());
        assertEquals("ValueForKey: 2", f2.get());
        assertEquals("ValueForKey: 3", f3.get());
        assertEquals("ValueForKey: 4", f4.get());

        // 验证批量处理的command只执行一次
        assertEquals(1, HystrixRequestLog.getCurrentRequest().getExecutedCommands().size());
        HystrixCommand<?> command = HystrixRequestLog.getCurrentRequest().getExecutedCommands().toArray(new HystrixCommand<?>[1])[0];
        // 验证执行的command是预期的command
        assertEquals("GetValueForKey", command.getCommandKey().name());
        // 验证这是折叠的command执行
        assertTrue(command.getExecutionEvents().contains(HystrixEventType.COLLAPSED));
        // 验证执行结果是成功的
        assertTrue(command.getExecutionEvents().contains(HystrixEventType.SUCCESS));
    } finally {
        context.shutdown();
    }
}


{% endhighlight %}















