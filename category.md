---
layout: page
title: Category
permalink: /category/
---

<div>
<h3>Blog Category </h3>  

{% for category in site.categories %}
    <h4>{{ category[0] }}</h4>

    <ul class="posts">
    {% for post in category[1] %}
        <li><a href="{{ post.url | prepend: site.baseurl }}">{{ post.title }}</a></li>
    {% endfor %}
    </ul>

{% endfor %}

</div>
