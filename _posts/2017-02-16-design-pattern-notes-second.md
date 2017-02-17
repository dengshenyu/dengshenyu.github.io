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

我们可以不用上面的方法，而定义一个TextShape类，由它来适配TextView的接口和Shape的接口。我们可以用两种方法做这件事：1）继承Shape类的接口和TextView的实现；或2）TextShape继承Shape类接口，同时将一个TextView实例作为TextShape的组成部分，在继承的接口中调用TextView的实现。这两种方法恰恰对应于Adapter模式的类版本和对象版本。我们将TextShape称为**适配器Adapter**。如下图所示。

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

当一个抽象可能有多个实现时，通常用继承协调它们。抽象类定义对该抽象的接口，而具体的子类则采用不同的方式加以实现。但是此方法有时不够灵活。继承机制将抽象部分与它的实现部分固定在一起，难以对抽象部分和实现部分独立地进行修改、扩充和重用。

让我们考虑在一个用户界面工具箱中，一个可移植的Windows抽象部分的实现。例如，这一抽象部分应该允许用户开发一些在XWindow System和IBM的Presentation Manager（PM）系统中都可以使用的应用程序。运用继承机制，我们可以定义Window抽象类和它的两个子类XWindow与PMWindow，由它们分别实现不同系统平台上的Window界面。

但继承机制有两个不足之处：

1）如果需要扩展Window抽象类，那么要使扩展后的抽象类适用于不同的系统平台很不方便。假设扩展Window类得到抽象类IconWindow，它专门用于图标处理。为了使IconWindow支持两个系统平台，我们必须实现两个新类XIconWindow和PMIconWindow。更为糟糕的是，我们不得不为每一种类型的扩展类都定义两个类。而为了支持第三个系统平台我们还必须为每一种抽象定义一个新的Window子类。如下图所示。

![bridge-one](/assets/design-pattern-notes-second/bridge-one.png)

2）继承机制使得客户代码与平台相关。每当客户创建一个Window时，必须要实例化一个具体的类，这个类由特定的实现部分。例如，创建XWindow对象会将Window抽象与XWindow的实现部分绑定起来，这使得客户程序依赖于XWindow的实现部分。这将使得客户代码很难被移植到其他平台上去。

Bridge模式解决以上问题的方法是，将Window抽象和它的实现部分分别放在独立的类层次结构中。其中一个类层次结构针对Window接口（Window、IconWindow、TransientWindow），另外一个独立的类层次结构针对平台相关的窗口实现部分，这个类层次结构的根类为WindowImp。例如XWindowImp子类提供了一个基于XWindow系统的实现。如下图所示。

![bridge-two](/assets/design-pattern-notes-second/bridge-two.png)

对Window子类的所有操作都是用WindowImp接口中的抽象操作实现的。这就将窗口的抽象与系统平台相关的实现部分分离开来。因此，我们将Window与WindowImp之间的关系成为**桥接**，因为它在抽象类与它的实现之间起到了桥梁作用，使它们可以独立地变化。

下面是这个模式的一般结构：

![bridge-three](/assets/design-pattern-notes-second/bridge-three.png)


## Composite（组合）

### 意图

将对象组合成树形结构以表示“部分-整体”的层次结构。Composite使得用户对于单个对象和组合对象的使用具有一致性。

### 动机

在绘图编辑器这个图形应用程序中，用户可以使用简单的组件创建复杂的图表。用户可以组合多个简单组件以形成一些较大的组件，这些组件又可以组合成更大的组件。一个简单的实现方法是Text和Line这样的图元定义一些类，另外定义一些类作为这些图元的容器类（Container）。

然而这种方法存在一个问题：使用这些类的代码必须区别对待图元对象与容器对象，而实际上大多数情况下用户认为它们是一样的。对这些类区别使用，使得程序更加复杂。Composite模式描述了如何使用递归组合，使得用户不必对这些类进行区别。如下图所示。

![composite-one](/assets/design-pattern-notes-second/composite-one.png)

Composite模式的关键是一个抽象类，它既可以代表图元，又可以代表图元的容器。在图形系统中的这个类就是Graphic，它声明一些与特定图形对象相关的操作，例如Draw。同时它也声明了所有的组合对象共享的一些操作，例如一些操作用于访问和管理它的子部件。

子类Line、Rectangle和Text（参见上面的类图）定义了一些图元对象，这些类实现Draw，分别用于绘制直线、矩形和正文。由于图元都没有子图形，因此它们都不执行与子类有关的操作。

Picture类定义了一个Graphic对象的聚合。Picture的Draw操作是通过对它的子部件调用Draw实现的，Picture还用这种方法实现了一些与其子部件相关的操作。由于Picture接口与Graphic接口是一致的，因此Picture对象可以递归地组合其他Picture对象。

下图是一个典型的由递归组合的Graphic对象组合的组合对象结构。

![composite-two](/assets/design-pattern-notes-second/composite-two.png)

下面是这个模式的一般结构：

![composite-three](/assets/design-pattern-notes-second/composite-three.png)



## Decorator（装饰）

### 意图

动态地给一个对象添加一些额外的职责。就增加功能来说，Decorator模式相比生成子类更加灵活。

### 动机

有时我们希望给某个对象而不是整个类添加一些功能。例如，一个图形用户界面工具箱允许你对任意一个用户界面组件添加一些特性，例如边框，或是一些行为，例如窗口滚动。

使用继承机制是添加功能的一种有效途径，但这种方法不够灵活，因为边框的选择是静态的，用户不能控制组件加边框的方式和时机。

一种较为灵活的方式是将组件嵌入另一个对象中，由这个对象添加边框。我们称这个嵌入的对象为**装饰**。这个装饰与它所装饰的组件接口一致，因此它对使用该组件的客户透明。它将客户请求转发给该组件，并且可能在转发前后执行一些额外的动作（例如画一个边框）。透明性使得你可以递归地嵌套多个装饰，从而添加任意多的功能。如下图所示。

![decorator-one](/assets/design-pattern-notes-second/decorator-one.png)

例如，假定有一个对象TextView，它可以在窗口中显示正文。缺省的TextView没有滚动条，因为我们可能有时并不需要滚动条。当需要滚动条时，我们可以用ScrollDecorator添加滚动条。如果我们还想在TextView周围添加一个粗黑边框，可以使用BorderDecorator添加。因此只需要简单地将这些装饰和TextView进行组合，就可以达到预期的效果。

下面的对象图展示了如何将一个TextView对象与BorderDecorator以及ScrollDecorator对象组装起来产生一个具有边框和滚动条的文本显示窗口。

![decorator-two](/assets/design-pattern-notes-second/decorator-two.png)

ScrollDecorator和BorderDecorator类是Decorator类的子类。Decorator类是一个可视组件的抽象类，用于装饰其他可视组件。如下图所示。

![decorator-three](/assets/design-pattern-notes-second/decorator-three.png)

VisualComponent是一个描述可视对象的抽象类，它定义了绘制和事件处理的接口。注意Decorator类怎样将绘制请求简单地发送给它的组件，以及Decorator的子类如何扩展这个操作。

这个模式中有一点很重要，它使得在VisualComponent可以出现的任何地方都可以有装饰。因此，客户通常不会感觉到装饰过的组件与未装饰组件之间的差异，也不会与装饰产生任何依赖关系。

下面是这个模式的一般结构。

![decorator-four](/assets/design-pattern-notes-second/decorator-four.png)


## Facade（外观）

### 意图

为子系统中的一组接口提供一个一致的界面，Facade模式定义了一个高层接口，这个接口使得这一子系统更加容易使用。

### 动机

将一个系统划分为若干个子系统有利于降低系统的复杂性。一个常见的设计目标是使子系统间的通信和相互依赖关系达到最小。达到该目标的途径之一是引入一个**外观（facade）**对象，它为子系统提供了一个单一而简单的界面。

![facade-one](/assets/design-pattern-notes-second/facade-one.png)

例如有一个编程环境，它允许应用程序访问它的编译子系统。这个编译子系统包含了若干类，例如Scanner、Parser、ProgramNode、BytecodeStream和ProgramNodeBuilder，用于实现这一编译器。有些特殊应用程序需要直接访问这些类，但是大多数编译器的用户并不关心语法分析和代码生成这样的细节；他们只是希望编译一些代码。对这些用户，编译子系统中哪些功能强大但层次较低的接口只会使他们的任务复杂化。

为了提供一个高层的接口并且对客户屏蔽这些类，编译子系统还包括一个Compiler类。这个类定义了一个编译器功能的统一接口。Compiler类是一个外观，它给用户提供了一个单一而简单的编译子系统接口。它无需完全隐藏实现编译功能的那些类，即可将它们结合在一起。编译器的外观可方便大多数程序员使用，同时对少数懂得如何使用底层功能的人，它并不隐藏这些功能。如下图所示。

![facade-two](/assets/design-pattern-notes-second/facade-two.png)


这个模式的一般结构如下：

![facade-three](/assets/design-pattern-notes-second/facade-three.png)


## Flyweight（享元）

### 意图

运用共享技术有效地支持大量细粒度的对象。

### 动机

有些应用程序得益于在其整个设计过程中都采用对象技术，但这种实现代价极大。

例如，大多数文档编辑器的实现都有文本格式化和编辑功能，这些功能在一定程度上是模块化的。面向对象的文档编辑器通常使用对象来表示嵌入的成分，例如表格和图形。应用程序的对象结构可以模拟文档的物理结构。下图显示了一个文档编辑器怎样使用对象来表示字符。

![flyweight-one](/assets/design-pattern-notes-second/flyweight-one.png)

但这种设计的缺点在于代价太大。即使是一个中等大小的文档也可能要求成百上千的字符对象，这会耗费大量内存，产生难以接受的运行开销。所以通常并不是对每个字符都用一个对象来表示的。Flyweight模式描述了如何共享对象，使得可以细粒度地使用它们而无需高昂的代价。

flyweight是一个共享对象，它可以同时在多个场景（context）中使用，并且在每个场景中flyweight都可以作为一个独立的对象--这一点与非共享对象的实例没有区别。flyweight不能对它所运行的场景做出任何假设，这里的关键概念是**内部状态**和**外部状态**之间的区别。内部状态存储于flyweight中，它包含了独立于flyweight场景的信息，这些信息使得flyweight可以被共享。而外部状态取决于flyweight场景，并根据场景而变化，因此不可共享。用户对象负责在必要的时候将外部状态传递给flyweight。

Flyweight模式对那些通常因为数量太大而难以用对象表示的概念或实体进行建模。例如，文档编辑器可以为字母表中的每一个字母创建一个flyweight。每个flyweight存储一个字符代码，但它在文档中的位置和排版风格可以在字符出现时由正文排版算法和使用的格式化命令决定。字符代码是内部状态，而其他的信息是外部状态。

逻辑上，文档中的给定字符每次出现都有一个对象与其对应，如下图所示。

![flyweight-two](/assets/design-pattern-notes-second/flyweight-two.png)

然而，物理上每个字符共享一个flyweight对象，而这个对象出现在文档结构中的不同地方。一个特定字符对象的每次出现都指向同一个实例，这个实例位于flyweight对象的共享池中。如下图所示。

![flyweight-three](/assets/design-pattern-notes-second/flyweight-three.png)

这些对象的类结构如下图所示。

![flyweight-four](/assets/design-pattern-notes-second/flyweight-four.png)

Glyph是图形对象的抽象类，其中有些对象可能是flyweight。基于外部状态的那些操作将外部状态作为参量传递给它们。例如，Draw和Intersects在执行之前，必须知道此Glyph所在的场景。表示字母“a”的flyweight只存储相应的字符代码；它不需要存储字符的位置或字体。用户提供与场景相关的信息，根据此信息flyweight绘出它自己。

由于不同的字符对象数远小于文档中的字符数，因此，对象的总数远小于一个初次执行的程序所使用的对象数目。对于一个所有字符都是用同样的字体和颜色的文档而言，不管这个文档有多长，需要分配100个左右的字符对象（大约是ASCII字符集的数目）。由于大多数文档使用的字体颜色组合不超过10种，实际应用中这一数目不会明显增加。因此，对单个字符进行对象抽象是具有实际意义的。

下面是这个模式的一般结构。

![flyweight-five](/assets/design-pattern-notes-second/flyweight-five.png)

其中注意的是，UnsharedConcreteFlyweight说明了并非所有的Flyweight子类都需要被共享。Flyweight接口使共享成为可能，但它并不强制共享。

下面的对象图说明了如何共享flyweight。

![flyweight-six](/assets/design-pattern-notes-second/flyweight-six.png)


##  Proxy（代理）

### 意图

为其他对象提供一种代理以控制对这个对象的访问。

### 动机

对一个对象进行访问控制的一个原因是为了在只有在我们确实需要这个对象时才对它进行创建和初始化。我们考虑一个可以在文档中嵌入图形对象的文档编辑器。有些图形对象（如大型光栅图像）的创建开销很大。但是打开文档必须很迅速，因此我们在打开文档时应避免一次性创建所有开销很大的对象。因为并非所有这些对象在文档中都同时可见，所以也没有必要同时创建这些对象。

这一限制条件意味着，对于每一个开销很大的对象，应该根据需要进行创建，当一个图像变为可见时会产生这样的需要。但是在文档中我们用什么来代替这个图像呢？我们又如何才能隐藏根据需要创建图像这一事实，从而不会使得编辑器的实现复杂化呢？例如，这种优化不应影响绘制和格式化的代码。

问题的解决方案是使用另一个对象，即图像Proxy，替代那个真正的图像。Proxy可以代替一个图像对象，并且在需要时负责实例化这个对象对象。

![proxy-one](/assets/design-pattern-notes-second/proxy-one.png)

只有当文档编辑器激活图像代理的Draw操作以显示这个图像的时候，图像Proxy才创建真正的图像。Proxy直接将随后的请求转发给这个图像对象。因此在创建这个图像以后，它必须有一个指向这个图像的引用。

我们假设图像存储在一个独立地文件中。这样我们可以把文件名作为实际对象的引用。Proxy还存储了图像的尺寸（extent），即它的长和宽。有了图像尺寸，Proxy无需真正实例化这个图像就可以相应格式化程序对图像尺寸的请求。

以下的类图更详细地阐述了这个例子。

![proxy-two](/assets/design-pattern-notes-second/proxy-two.png)

文档编辑器通过抽象的Graphic类定义的接口访问嵌入的图像。ImageProxy是一个代理类，它保存了文件名作为指向磁盘上的图像文件的指针。该文件名被作为一个参数传递给ImageProxy的构造器。

ImageProxy还存储了这个图像的边框以及对真正的Image实例的指引，知道代理实例化真正的图像时，这个指引才有效。Draw操作必须保证在向这个图像转发请求之前，它已经被实例化了。GetExtent操作只有在图像被实例化后才向它传递请求，否则，ImageProxy返回它存储的图像尺寸。

下面是一些可以使用Proxy模式常见情况：

1. 远程代理（Remote Proxy）：为一个对象在不同的地址空间提供局部代表。
2. 虚代理（Virtual Proxy）：根据需要创建开销很大的对象。
3. 保护代理（Protection Proxy）：控制对原始对象的访问。
4. 智能指引（Smart Reference）：取代简单的指针，它在访问对象时执行一些附加操作。

下面是这个模式的一般结构。

![proxy-three](/assets/design-pattern-notes-second/proxy-three.png)


这是运行时刻一种可能的代理结构的对象图。

![proxy-four](/assets/design-pattern-notes-second/proxy-four.png)

