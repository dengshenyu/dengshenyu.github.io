---
layout: post
title: "CSS的居中问题"
keywords: "CSS,Center,居中"
description: "CSS居中，Center"
date: 2016-05-18 00:00
categories: "前端技术"
---

> 本文译自[Bert Bos](https://www.w3.org/People/Bos/)的[《CENTERING THINGS》](https://www.w3.org/Style/Examples/007/center.en.html)，译文带有自己的理解与整理，如有纰漏恳请指出。


CSS中一个常见的问题就是图片或者文本的居中。这个问题可以细分成以下三种：

* 文本居中对齐
* 块水平居中
* 块垂直居中

下面我们来讨论下这几个问题。

## 文本的居中对齐

最常见以及最容易的居中问题是段落或者标题的文本居中显示，CSS中的**text-align**属性可以解决这个问题：

{% highlight html %}

p  { text-align: center }
h2 { text-align: center }

{% endhighlight %}

这将会使得p或者h2中的每一行居中对齐，就像这样

![lines-align](/assets/css-center/lines-align.png)

## 块或者图片的水平居中

有时候不仅仅是文本需要居中，而是一个块需要居中。换另一种描述：我们想块的左边距和右边距相同。解决的办法是将这些边距设置成auto。如果块的宽度是固定的话这种做法是很常用的，但如果块本身是大小可变的话这个块会占满整个可用宽度，从而失效。

这种做法示例如下：

{% highlight html %}

p.blocktext {
	margin-left: auto;
	margin-right: auto;
	width: 6em;
}
...
<p class="blocktext">This rather...

{% endhighlight %}

![margin-auto](/assets/css-center/margin-auto.png)

这种做法也可以用来使得图片居中：让图片变成块，然后对它使用margin属性。举个栗子：

{% highlight html %}

img.displayed {
	display: block;
	margin-left: auto;
	margin-right: auto
}
...
<img class="displayed" src="..." alt="...">

{% endhighlight %}

![image-center](/assets/css-center/image-center.png)

## 块垂直居中

CSS2没有单独属性来使得块垂直居中，不过CSS3总算是有了。在CSS2中你可以同时通过使用几个属性来实现实现块的垂直居中，这个技巧就是将父级块变成一个table cell——因为table cell中的内容会被垂直居中。

{% highlight html %}

div.container {
    min-height: 10em;
    display: table-cell;
    vertical-align: middle
}
...
<div class="container">
  <p>This small paragraph...</p>
</div>

{% endhighlight %}

![vertical-css2](/assets/css-center/vertical-css2.png)

## CSS3中的垂直居中

CSS3为垂直居中提供了其他的解决办法。我们可以使用绝对定位来实现垂直居中，但这可能会导致页面元素重叠，如果你知道在你的场景中不会发生元素重叠的情况，你可以使用绝对定位以及‘transform’属性来居中元素。例如：

![vertical-css3-1](/assets/css-center/vertical-css3-1.png)

页面结构会类似于这样：

{% highlight html %}

<div class=container3>
  <p>This paragraph…</p>
</div>

{% endhighlight %}

css样式会类似于这样：

{% highlight html %}

div.container3 {
   height: 10em;
   position: relative                /* 1 */
}
div.container3 p {
   margin: 0;
   position: absolute;               /* 2 */
   top: 50%;                         /* 3 */
   transform: translate(0, -50%)     /* 4 */
}

{% endhighlight %}

需要注意的几点是：

1. 将父级container声明为相对定位；

2. 将需要垂直居中的元素声明为绝对定位；

3. 使用‘top: 50%’来将该元素放置在container的高度的一半。（注意这里的50%指的是container高度的50%）

4. 使用translation来将该元素向上移动其高度的一半。（‘translation(0, -50%)’的50%指的是元素自身的高度）

我们也可以使用display属性的新关键字flex来实现垂直居中。

![vertical-css3-1](/assets/css-center/vertical-css3-1.png)

CSS样式会类似于这样：

{% highlight html %}

div.container5 {
  height: 10em;
  display: flex;
  align-items: center
}
div.container5 p {
  margin: 0 
}

{% endhighlight %}


## CSS3中同时垂直、水平居中

我们可以混合使用上述方法来实现同时垂直、水平居中。

注意将段落绝对定位的一个副作用：段落有多长它就有多宽（除非我们显式为段落指定一个宽度）。在下面这个例子中，我们不指定宽度因为我们只有一个单词（"Center!"），这时候段落的宽度等于单词的宽度。

![vertical-horizon](/assets/css-center/vertical-horizon.png)

页面结构：

{% highlight html %}

<div class=container4>
  <p>Centered!</p>
</div>

{% endhighlight %}

对于CSS样式，垂直居中的部分和之前的例子一样。但我们现在使用‘left: 50%’将元素放置在container的水平一半的位置，同时使用‘translate’转换将其向左移动其宽度的一半：

{% highlight html %}

div.container4 {
    height: 10em;
    position: relative 
}
div.container4 p {
    margin: 0;
    background: yellow;
    position: absolute;
    top: 50%;
    left: 50%;
    margin-right: -50%;
    transform: translate(-50%, -50%) 
}

{% endhighlight %}
 
下面这个[例子](#viewport)解释为什么‘margin-right: -50%’是需要的。

如果CSS支持‘flex’的话，那同时垂直、水平居中就更简单了：

![vertical-horizon](/assets/css-center/vertical-horizon.png)

CSS样式：

{% highlight html %}

div.container6 {
  height: 10em;
  display: flex;
  align-items: center;
  justify-content: center 
}
div.container6 p {
  margin: 0 
}

{% endhighlight %}

相比之前，只增加了‘justify-content: center’。就像‘align-items’决定了container里面的元素的垂直对齐一样，‘justify-content’决定了水平的对齐。（就像它们起的名字一样实际更复杂点，但简单来说作用是这样的）。

## <a name="viewport"></a>CSS3在viewport居中

对于一个绝对定位的元素默认的container是viewport（对于浏览器来说，就是浏览器窗口）。在viewport居中非常简单，下面是一个完整的例子（使用HTML5语法）：

{% highlight html %}

<html>
  <style>
    body {
        background: white 
    }
    section {
        background: black;
        color: white;
        border-radius: 1em;
        padding: 1em;
        position: absolute;
        top: 50%;
        left: 50%;
        margin-right: -50%;
        transform: translate(-50%, -50%)
    }
  </style>
  <section>
    <h1>Nicely centered</h1>
    <p>This text block is vertically centered.
    <p>Horizontally, too, if the window is wide enough.
  </section>

{% endhighlight%}

‘margin-right’是用来补偿‘left: 50%’的。由于‘left’规则将可用宽度减少了50%，因此每一行的宽度都变得不超过父级container宽度的一半。通过声明其margin-right向右扩展50%，行宽重新变得与container的宽度一样。

试试调整浏览器窗口大小：当窗口足够宽的时候每个句子都只占一行，只有当窗口对于整个句子太窄的时候这些句子会被切割成几行。去掉‘margin-right: -50%’，然后重新调整窗口，你会看到即便窗口的宽度等于文本宽度的两倍但这些句子已经被切割成多行了。

（使用‘translate’来在viewport中居中的方法是Charlie在[Stack Overflow的一个答案](http://stackoverflow.com/questions/5412912/align-vertically-using-css-3/16026893#answer-16026893)首次提出的）



