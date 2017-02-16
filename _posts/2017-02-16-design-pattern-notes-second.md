---
layout: post
title: "《设计模式》读书笔记之结构型模式"
keywords: "Java,设计模式"
description: "《设计模式》读书笔记之创建型模式"
date: 2017-02-16 20:00
categories: "计算机科学"
---

结构型模式涉及到如何组合类和对象以获得更大的结构。

结构型模式包含如下七种模式：

* Adapter（适配器）：使得一个接口（adaptee的接口）与其他接口兼容，从而给出多个不同接口的统一抽象。
* Bridge（桥接）：将对象的抽象和其实现分离，从而可以独立地改变它们。
* Composite（组合）：描述了如何构造一个类层次结构，这一结构由两种类型的对象（基元对象和组合对象）所对应的类构成。
* Decorator（装饰）：描述了如何动态地为对象添加职责。
* Facade（外观）：描述了如何用单个对象表示整个子系统。
* Flyweight（享元）：描述了如何共享对象。
* Proxy（代理）：作为其他对象的一个方便的替代或占位符。

下面我们来分别看下这几种模式。

## Adapter（适配器）

### 意图

将一个类的接口转换成客户希望的另外一个接口。Adapter模式使得原本由于接口不兼容而不能一起工作的那些类可以一起工作。

### 动机

例如，有一个绘图编辑器，这个编辑器允许用户绘制和排列基本图元（线、多边形和正文等）生成图片和图表。这个绘图编辑器的关键抽象是图形对象图形对象有一个可编辑的形状，并可以绘制自身。图形对象的接口由一个称为Shape的抽象类定义。绘图编辑器为每一种图形对象定义了一个Shape的子类：LineShape对应于直线，PolygonShape类对应于多边形。

像LineShape和PolygonShape这样的基本几何图形的类比较容易实现，这是由于它们的绘图和编辑功能本来就很有限。但是对于可以显示和编辑正文的TextShape子类来说，实现相当困难，因为即使是基本的正文编辑也要涉及到复杂的屏幕刷新和缓冲区管理。同时，成品的用户界面工具箱可能已经提供了一个复杂的TextView类用于显示和编辑正文。理想的情况是我们可以复用这个TextView类以实现TextShape类，但工具箱的设计者当时并没有考虑Shape的存在，因此TextView和Shape对象不能互换。

我们可以改变TextView类使它兼容Shape类的接口，但前提是必须有这个工具箱的源代码。然而即使我们得到了这些源代码，修改TextView也是没有什么意义的；因为不应该为了实现一个应用，工具箱就不得不采用一些与特定领域相关的接口。

我们可以不用上面的方法，而定义一个TextShape类，由它来适配TextView的接口和Shape的接口。我们可以用两种方法做这件事：1）继承Shape类的接口和TextView的实现；或2）TextShape继承Shape类接口，同时将一个TextView实例作为TextShape的组成部分，在继承的接口中调用TextView的实现。这两种方法恰恰对应于Adapter模式的类版本和对象版本。我们将TextShape称为**适配器Adapter**。

![adapter-one](/assets/design-pattern-notes-second/adapter-one.png)

上图是对象版本的Adapter模式。它说明了在Shape类中声明的BoundingBox请求如何被转换成在TextView类中定义的GetExtent请求。

Adapter时常还要提供那些被匹配的类所没有提供的功能。上面的类图说明了这一点。由于绘图编辑器允许用户将一个Shape对象“拖动”到一个新的位置，而TextView设计中没有这个功能。我们可以实现TextShape类的CreateManipulator操作，从而增加这个缺少的功能。

下面是一般情况下的Adapter模式的结构图：

**类版本**

![adapter-two](/assets/design-pattern-notes-second/adapter-two.png)

**对象版本**

![adapter-three](/assets/design-pattern-notes-second/adapter-three.png)


## Bridge（桥接）

### 意图

将抽象部分与它的实现部分分离，使它们都可以独立地变化。

### 动机

当一个抽象可能有多个实现时，通常用继承协调它们。抽象类定义对该抽象的接口，而具体的子类则采用不同的方式加以实现。但是此方法有时不够灵活。继承机制将抽象部分与它的实现部分固定在一起，🙆难以对抽象部分和实现部分独立地进行修改、扩充和重用。

让我们考虑在一个用户界面工具箱中，一个可移植的Windows抽象部分的实现。例如，这一抽象部分应该允许用户开发一些在XWindow System和IBM的Presentation Manager（PM）系统中都可以使用的应用程序。运用继承机制，我们可以定义Window抽象类和它的两个子类XWindow与PMWindow，由它们分别实现不同系统平台上的Window界面。

但继承机制有两个不足之处：

1. 如果需要扩展Window抽象类，那么要使扩展后的抽象类适用于不同的系统平台很不方便。假设扩展Window类得到抽象类IconWindow，它专门用于图标处理。为了使IconWindow支持两个系统平台，我们必须实现两个新类XIconWindow和PMIconWindow。更为糟糕的是，我们不得不为每一种类型的扩展类都定义两个类。而为了支持第三个系统平台我们还必须为每一种抽象定义一个新的Window子类。如下图所示。

![bridge-one](/assets/design-pattern-notes-second/bridge-one.png)

2. 继承机制使得客户代码与平台相关。每当客户创建一个Window时，必须要实例化一个具体的类，这个类由特定的实现部分。例如，创建XWindow对象会将Window抽象与XWindow的实现部分绑定起来，这使得客户程序依赖于XWindow的实现部分。这将使得客户代码很难被移植到其他平台上去。

Bridge模式解决以上问题的方法是，将Window抽象和它的实现部分分别放在独立的类层次结构中。其中一个类层次结构针对Window接口（Window、IconWindow、TransientWindow），另外一个独立的类层次结构针对平台相关的窗口实现部分，这个类层次结构的根类为WindowImp。例如XWindowImp子类提供了一个机遇XWindow系统的实现。如下图所示。

![bridge-two](/assets/design-pattern-notes-second/bridge-two.png)

对Window子类的所有操作都是用WindowImp接口中的抽象操作实现的。这就将窗口的抽象与系统平台相关的实现部分分离开来。因此，我们将Window与WindowImp之间的关系成为**桥接**，因为它在抽象类与它的实现之间起到了桥梁作用，使它们可以独立地变化。

下面是这个模式的一般结构：

![bridge-three](/assets/design-pattern-notes-second/bridge-three.png)


## Composite（组合）



