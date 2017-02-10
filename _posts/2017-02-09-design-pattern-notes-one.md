---
layout: post
title: "《设计模式》读书笔记之创建型模式"
keywords: "Java,设计模式"
description: "设计模式》读书笔记之创建型模式"
date: 2017-02-09 16:00
categories: "Java"
---


创建型模式抽象了实例化过程。

创建型模式包含如下五种模式：

* Abstract Factory（抽象工厂）
* Builder（生成器）
* Factory Method（工厂方法）
* Prototype（原型）
* Singleton（单例)

在这些模式中有两个不断出现的主旋律：1）它们都将关于该系统使用哪些具体的类的信息封装起来；2）它们隐藏了这些类的实例是如何被创建和放在一起的。整个系统关于这些对象所知道的是由抽象类所定义的接口。

因此，创建型模式在**什么**被创建，**谁**创建它，它是**怎样**被创建的，以及**何时**创建这些方面给予你很大的灵活性。

## Abstract Factory（抽象工厂）

### 意图

提供一个创建一系列相关或相互依赖对象的接口，而无需指定它们具体的类。

### 动机

考虑一个支持多种视感标准的用户界面工具包，例如Motif和Presentation Manager。不同的视感风格为诸如滚动条、窗口和按钮等用户界面组件定义不同的外观和行为。为了保证不同视感风格的可切换，应用不应该硬编码它的界面组件。

我们可以定义一个抽象的WidgetFactory类，这个类声明了一个用来创建每一类基本窗口组件的接口。每一类窗口组件都有一个抽象类，而具体子类则实现了窗口组件的特定视感风格。对于每一个抽象窗口组件类，WidgetFactory接口都有一个返回新窗口组件对象的操作。客户调用这些操作以获得窗口组件实例，但客户并不知道他们正在使用的是哪些具体类。这样客户就不依赖一般的视感风格。如下图所示。

![abstract-factory](/assets/design-pattern-notes-one/abstract-factory.png)

## Builder（生成器）

### 意图

将一个复杂对象的构建与它的表示分离，使得同样的构建过程可以创建不同的表示。

### 动机

一个RTF（Rich Text Format）文档交换格式的阅读器应能将RTF转换为多种正文格式。该阅读器可以将RTF文档转换成普通ASCII文本或转换成一个能以交互方式编辑的正文窗口组件。但问题在于可能转换的数目是无限的，因此要能够很容易实现新的转换的增加，同时却不改变RTF阅读器。

一个解决办法是，我们使用TextConverter来抽象将RTF转换成另一种正文表示这个过程，并且将它配置到RTFReader类中。当RTFReader对RTF文档进行语法分析时，它使用TextConverter做转换。无论何时RTFReader识别了一个RTF标记（或是普通正文或是一个RTF控制字），它都发送一个请求给TextConverter去转换这个标记。TextConverter对象负责进行数据转换以及用特定格式表示该标记。如下图所示。

![builder](/assets/design-pattern-notes-one/builder.png)

TextConverter的子类对不同转换和不同格式进行特殊处理。例如，一个ASCIIConverter只负责转换普通文本，而忽略其他转换请求。另一方面，一个TeXConverter将会实现所有的操作，以便生成一个获取正文中所有风格信息的TEX表示。

## Factory Method（工厂方法）

### 意图

定义一个用于创建对象的接口，让子类决定实例化哪一个类。Factory Method使一个类的实例化延迟到其子类。

### 动机

考虑这样一个应用框架，它可以向用户显示多个文档。在这个框架中，两个主要的抽象是类Application和Document。这两个类都是抽象的，客户必须通过它们的子类来做与具体应用相关的实现。例如，为创建一个绘图应用，我们定义类DrawingApplication和DrawingDocument。Application类负责管理Document并根据需要创建它们--例如，当用户从菜单中选择Open或New的时候。

但这里有个问题，Application类不可能预测到哪个Document子类将被实例化，Application类仅知道一个新的文档何时应被创建，而不知道哪一种Document将被创建。

Factory Method模式提供了一个解决办法，它封装了哪一个Document子类将被创建的信息并将这些信息从该框架中分离出来。如下所示。

![factory-method](/assets/design-pattern-notes-one/factory-method.png)

Application的子类重定义Application的抽象操作CreateDocument以返回适当的Document子类对象。我们称CreateDocument是一个工厂方法（factory method），因为它负责“生产”一个对象。

## Prototype（原型）

### 意图

用原型实例指定创建对象的种类，并且通过拷贝这些原型创建新的对象。

### 动机

考虑构造一个乐谱编辑器，它包含一个通用的图形编辑器框架和表示音符、休止符和五线谱的音乐对象。编辑器框架中有一个工具选择板用于将这些音乐对象加到乐谱中。这个选择板可能还包括选择、移动和其他操纵音乐对象的工具。用户可以点击四分音符工具并使用它将四分音符加到乐谱中，或者他们可以使用移动工具在五线谱上下移动一个音符，从而改变它的音调。

我们假定这些音乐对象都继承于一个抽象的Graphics类，而工具板中的工具继承于一个抽象的Tool类。其中，对于创建音乐对象实例并将它们加入到乐谱中的工具，我们定义一个GraphicTool子类。

但这样有个问题，GraphicTool类属于框架，而音符和五线谱这些特定音乐对象特定于我们的应用。GraphicTool不知道如何创建我们的音乐类的实例，并将它们添加到乐谱中。我们当然可以为每一种音乐对象创建一个GraphicTool的子类，但这样会产生大量的子类，这些子类仅仅在它们所初始化的音乐对象的类别上有所不同。我们知道对象复合是比创建子类更灵活的一种选择。问题是，该框架怎么样用它来参数化GraphicTool的实例。

解决办法是让GraphicTool通过拷贝一个Graphic子类的实例来创建新的Graphic，这个Graphic子类的实例称之为**原型**。GraphicTool将这个原型作为参数。如果所有的Graphic子类都支持clone操作，那么GraphicTool可以克隆所有种类的Graphic。如下图所示。

![prototype](/assets/design-pattern-notes-one/prototype.png)

## Singleton（单例）

### 意图

保证一个类仅有一个实例，并提供一个访问它的全局访问点。

### 动机

对于一些类来说，只有一个实例是很重要的。我们怎么样才能保证一个类只有一个实例并且这个实例易于被访问呢？一个全局变量使得一个对象可以被访问，但它不能防止你实例化多个对象。

一个更好的办法是，让类自身负责保存它的唯一实例。这个类可以保证没有其它实例可以被创建，并且它可以提供一个访问该实例的方法。这就是Singleton模式。如下图所示。

![singleton](/assets/design-pattern-notes-one/singleton.png)


