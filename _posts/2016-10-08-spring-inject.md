---
layout: post
title: "【译】Spring依赖注入之@Inject，@Autowired，@Resource"
keywords: "Java,Spring"
description: "Spring依赖注入之@Inject，@Autowired，@Resource"
date: 2016-10-09 00:00
categories: "后端技术,Java,Spring"
---


## 背景

我曾经被问过若干次Spring中使用'@Resource', '@Autowired'和'@Inject'实现依赖注入的区别这个问题，尽管我从同事得到一些看法同时也从网上看了相关的几篇文章，但我仍然模棱两可。

**注解**

|---
| ANNOTATION | PACKAGE | SOURCE |
|-|:-|:-:|-:
| @Resource | javax.annotation | Java
| @Inject | javax.inject | Java
| @Qualifier | javax.inject | Java
| @Autowired | org.springframework.bean.factory | Java

为了探索每个注解的行为我兴奋的打开了[Spring Tool Suite](http://www.springsource.com/developer/sts)，然后开始debug代码。我在实验中使用了Spring 3.0.5.RELEASE这个版本，以下是我发现的一些总结。

## 代码

由于我想知道'@Resource'，'@Autowired'和'@Inject'是如何解决依赖注入的，因此在这里我创建了一个Party接口和两个子实现类。这会导致在依赖注入时不能匹配到明确类型，从而让我对Spring在多个类型都匹配时如何解决依赖注入进一步研究。

Party接口

{% highlight java %}

public interface Party {

}

{% endhighlight %}

Person是一个component并且它实现了Party这个接口


{% highlight java %}
package com.sourceallies.person;
...

@Component
public class Person implements Party {

}

{% endhighlight %}

Organization是一个component并且也实现了Party


{% highlight java %}
package com.sourceallies.organization;
...

@Component
public class Organization implements Party {

}

{% endhighlight %}


我设置了Spring context，扫描标记了'@Component'的这两个bean所在的package。


{% highlight xml %}

<context:component-scan base-package="com.sourceallies.organization" />
<context:component-scan base-package="com.sourceallies.person" />

{% endhighlight %}

## 测试

### 测试1：注入时bean有歧义

在这个实验中，我注入一个Party类，而Party在当前Spring上下文中有多个实现。


{% highlight java %}

@Resource
private Party party;

@Autowired
private Party party;

@Inject
private Party party;

{% endhighlight %}

**这三个case都会抛出‘NoSuchBeanDefinitionException’异常。虽然这个异常的名字似乎表明没有找到bean，但它携带的message解释其实是说找到了两个合适的bean。所有这些注解都会导致相同异常。**

### 测试2：变量名

在这个测试中我声明Party类型的变量名为person。在默认情况下，标记为‘@Component’的bean会有和类名相同的名称，也就是说Person这个bean的名称为person。


{% highlight java %}

@Resource
private Party person;

@Autowired
private Party person;

@Inject
private Party person;

{% endhighlight %}

值得一提的是，‘@Resource’有一个可选的name属性，见下面。下面这种写法和上面的@Resource写法效果相同，因为缺省时name默认为变量名称。

对于‘@Autowired’和‘@Inject’没有这样的写法。不过你可以额外使用‘@Qulifier’，这种语法后面会提到。


{% highlight java %}

@Resource(name="person")
private Party party;

{% endhighlight %}

**所有这几种写法都会成功注入Person**

### 变量类型

在这个测试中我将类型改成Person。


{% highlight java %}

@Resource
private Person party;

@Autowired
private Person party;

@Inject
private Person party;

{% endhighlight %}

**所有这几种写法都会成功注入Person类**

### 缺省名称限定符

在这个测试中我使用‘@Qualifier’注解来指定到Person类的默认名称。

{% highlight java %}

@Resource
@Qualifier("person")
private Party party;

@Autowired
@Qualifier("person")
private Party party;

@Inject
@Qualifier("person")
private Party party;

{% endhighlight %}

**所有这几种写法都会成功注入Person类**

### 名称限定

我往Person类添加一个‘@Qualifier’注解

{% highlight java %}

package com.sourceallies.person;
...

@Component
@Qualifier("personBean")
public class Person implements Party {

}

{% endhighlight %}

然后在测试中使用‘@Qualifier’来指定到Person的声明名称

{% highlight java %}

@Resource
@Qualifier("personBean")
private Party party;

@Autowired
@Qualifier("personBean")
private Party party;

@Inject
@Qualifier("personBean")
private Party party;

{% endhighlight %}

**所有这几种写法都会成功注入Person**

### Bean列表

在这个测试中我注入一个bean列表


{% highlight java %}

@Resource
private List<Party> parties;

@Autowired
private List<Party> parties;

@Inject
private List<Party> parties;

{% endhighlight %}

**这三个注解都会注入两个bean到列表中（也就是Person和Organization）。另外，我们也可以使用‘@Qualifier’达到这个目的，这样的话被标记有特定名称的bean将会被添加到列表中。**

### 测试7：多种方式冲突

在这个测试中我添加一个错误的‘@Qualifier’**同时**又使用匹配到person的变量名。

{% highlight java %}

@Resource
@Qualifier("bad")
private Party person;

@Autowired
@Qualifier("bad")
private Party person;

@Inject
@Qualifier("bad")
private Party person;

{% endhighlight %}

**在这个测试中，‘@Resource’注解采取了变量名匹配而忽略了‘@Qualifier’，Person被成功注入**

**而‘@Autowired’和‘@Inject’两个变量定义抛出了‘NoSuchBeanDefinitionException’异常，这是因为它没有找到匹配到声明为相应bad的bean。**

{% highlight message %}

org.springframework.beans.factory.NoSuchBeanDefinitionException: 
No matching bean of type [com.sourceallies.Party] found for dependency: 
expected at least 1 bean which qualifies as autowire candidate for this dependency. 
Dependency annotations: {@org.springframework.beans.factory.annotation.Autowired(required=true),
@org.springframework.beans.factory.annotation.Qualifier(value=bad)}

{% endhighlight %}

## 结论

除了测试2和测试7，其余的测试配置和结果都是相同的。当我仔细研究后，我发现‘@Autowired’和‘@Inject’这两个注解行为完全相同，都是通过[AutowiredAnnotationBeanPostProcessor](http://docs.spring.io/spring/docs/3.0.x/javadoc-api/org/springframework/beans/factory/annotation/AutowiredAnnotationBeanPostProcessor.html)来实现依赖注入。也就是说，在注入Spring bean的时候‘Autowired’和‘@Inject’可以互换。

而‘@Resource’使用[CommonAnnotationBeanPostProcessor](http://docs.spring.io/spring/docs/3.1.0.M2/javadoc-api/org/springframework/context/annotation/CommonAnnotationBeanPostProcessor.html)来实现注入。虽然它使用的注入处理类不一样，但是其实所有这三个注解行为**几乎**一样。下面是它们执行逻辑顺序的总结：

**@Autowired和@Inject**

1. 按照类型匹配
2. 使用限定符进行类型限定
3. 按照名称匹配

**@Resource**

1. 按照名称匹配
2. 按照类型匹配
3. 使用限定符进行类型限定（但如果名称匹配成功的话这条会被忽略）

虽然有人说使用名称匹配时‘@Resource’性能比‘@Autowired’和‘@Inject’要好，但其实性能提升是微乎其微的。这个理由并不能充分说明‘@Resource’要比其他两个要好。但我仍然喜欢用‘@Resource’注解，因为其简明的符号写法：


{% highlight java %}

@Resource(name="person")

@Autowired
@Qualifier("person")

@Inject
@Qualifier("person")

{% endhighlight %}

你可能会说如果使用变量名称来指定bean的话，他们同样简明：

{% highlight java %}

@Resource
private Party person;

@Autowired
private Party person;

@Inject
private Party person;

{% endhighlight %}

的确是这样。但如果你想重构代码呢？简单的变量重命名就会导致指定的bean不同了！因此，在使用注解来写bean的时候我建议采用如下方法。

**Spring注解风格最佳实践**

1. 显式命名component：@Component("beanName")。
2. 使用‘@Resource’的时候带上name属性：@Resource(name="beanName")。
3. 避免使用‘@Qualifier’，除非你想创建一个bean列表。例如，你可能想使用特定‘@Qualifier’来标记一些规则，然后将这些规则类注入到一个列表中，从而使用这个规则列表来处理数据。
4. 扫描component的时候使用更具体的包：context:component-scan base-package=“com.sourceallies.person”。虽然这会导致更多的component-scan配置，但是能够在当前Spring context中减少不必要的component。

遵循这些规则的话，应该可以增加Spring注解配置的可读性和稳定性:)。


原文地址[spring-injection-with-resource-and-autowired](http://blogs.sourceallies.com/2011/08/spring-injection-with-resource-and-autowired/)
