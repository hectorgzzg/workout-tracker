<template>
  <section class="page-content">
    <header class="page-heading">
      <p class="eyebrow">Workout Tracker</p>
      <h1>{{ $route.meta.pageTitle }}</h1>
    </header>
    <div class="empty-state">
      <h2>{{ $route.meta.emptyTitle }}</h2>
      <p>{{ $route.meta.pageMessage }}</p>
    </div>
  </section>
</template>
