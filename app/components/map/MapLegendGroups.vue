<script setup lang="ts">
import type { LegendGroup, LegendSample } from '~/utils/mapLegend'

// Groups of the map legend. Each sample is drawn at the size the map draws it, over the map's background, so
// that it reads the same in light and dark mode.
defineProps<{
  groups: LegendGroup[]
  background: string
}>()

const { t } = useI18n()

const HEIGHT = 28
// Items with several samples (marked trails in each waymark colour) get narrower ones, on a row.
const sampleWidth = (count: number) => (count > 1 ? 28 : 40)

const arrowPoints = GPS_ARROW_POINTS.map(point => point.join(',')).join(' ')

// Sprite images bigger than the sample are scaled down.
function imageBox(sample: Extract<LegendSample, { kind: 'image' }>, width: number) {
  const { width: imageWidth, height: imageHeight } = sample.image
  const scale = Math.min(1, (width - 4) / imageWidth, (HEIGHT - 4) / imageHeight)
  return { width: imageWidth * scale, height: imageHeight * scale, x: (width - imageWidth * scale) / 2, y: (HEIGHT - imageHeight * scale) / 2 }
}
</script>

<template>
  <div class="space-y-4">
    <section v-for="group in groups" :key="group.title" class="space-y-2">
      <h3 class="text-xs font-semibold text-muted">{{ t(group.title) }}</h3>
      <ul class="space-y-2">
        <li
          v-for="item in group.items"
          :key="item.label"
          class="flex gap-3 text-sm"
          :class="item.samples.length > 1 ? 'flex-col-reverse gap-1.5' : 'items-center'"
        >
          <span class="flex flex-wrap gap-1" aria-hidden="true">
            <template v-for="(sample, i) in item.samples" :key="i">
              <span
                v-if="sample.kind === 'poi'"
                class="flex shrink-0 items-center justify-center"
                :style="{ width: `${sampleWidth(item.samples.length)}px`, height: `${HEIGHT}px` }"
              >
                <span class="flex size-7 items-center justify-center rounded-full border-2 border-white text-white shadow-md" :style="{ backgroundColor: POI_COLORS[sample.type] }">
                  <UIcon :name="POI_ICONS[sample.type]" class="size-4" />
                </span>
              </span>
              <span
                v-else-if="sample.kind === 'osmPlace'"
                class="flex shrink-0 items-center justify-center"
                :style="{ width: `${sampleWidth(item.samples.length)}px`, height: `${HEIGHT}px` }"
              >
                <OsmPlaceIcon :type="sample.type" />
              </span>
              <svg
                v-else
                :width="sampleWidth(item.samples.length)"
                :height="HEIGHT"
                :viewBox="`0 0 ${sampleWidth(item.samples.length)} ${HEIGHT}`"
                class="shrink-0 rounded-sm ring-1 ring-default"
                data-legend-sample
              >
                <rect width="100%" height="100%" :fill="background" />
                <template v-if="sample.kind === 'layers'">
                  <template v-for="(part, j) in sample.parts" :key="j">
                    <rect v-if="part.type === 'fill'" width="100%" height="100%" :fill="part.color" :fill-opacity="part.opacity" />
                    <line
                      v-else
                      x1="6"
                      :x2="sampleWidth(item.samples.length) - 6"
                      :y1="HEIGHT / 2"
                      :y2="HEIGHT / 2"
                      :stroke="part.color"
                      :stroke-width="part.width"
                      :stroke-opacity="part.opacity"
                      :stroke-linecap="part.cap"
                      :stroke-dasharray="part.dashes"
                    />
                  </template>
                </template>
                <circle
                  v-else-if="sample.kind === 'circle'"
                  :cx="sampleWidth(item.samples.length) / 2"
                  :cy="HEIGHT / 2"
                  :r="sample.radius"
                  :fill="sample.color"
                  :fill-opacity="sample.opacity ?? 1"
                  :stroke="sample.stroke"
                  :stroke-width="sample.strokeWidth"
                />
                <!-- The 32 px arrow of the map, at 24 px. -->
                <g v-else-if="sample.kind === 'arrow'" :transform="`translate(${(sampleWidth(item.samples.length) - 24) / 2} 2) scale(0.75)`">
                  <polygon
                    :points="arrowPoints"
                    :fill="GPS_COLOR"
                    stroke="#ffffff"
                    :stroke-width="GPS_ARROW_OUTLINE"
                    stroke-linejoin="round"
                    paint-order="stroke"
                  />
                </g>
                <image
                  v-else-if="sample.kind === 'image'"
                  :href="sample.image.src"
                  v-bind="imageBox(sample, sampleWidth(item.samples.length))"
                />
              </svg>
            </template>
          </span>
          <span>{{ t(item.label) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
