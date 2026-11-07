<!-- Contour lines behind a header (#229), drawn in --contour, faint on the paper. Decorative: the parent is
     `relative` (and `overflow-hidden` if needed) and its content comes after, or `relative`, to stay on top. -->
<template>
  <svg
    viewBox="0 0 390 200"
    preserveAspectRatio="xMidYMin slice"
    class="pointer-events-none absolute inset-x-0 top-0 h-50 w-full fill-none stroke-(--contour)"
    stroke-width="1"
    aria-hidden="true"
  >
    <path d="M-10 40 C60 20 120 70 200 50 S330 10 400 40" />
    <path d="M-10 70 C70 50 130 100 210 80 S330 40 400 70" stroke-width="1.8" />
    <path d="M-10 100 C80 85 140 130 220 110 S330 75 400 100" />
    <path d="M-10 130 C90 120 150 160 230 140 S330 110 400 130" />
    <path d="M-10 160 C90 150 160 190 240 170 S330 145 400 160" />
    <path d="M282 34 C302 22 334 24 340 38 S314 58 292 52 S270 44 282 34 Z" />
  </svg>
</template>
