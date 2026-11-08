<!-- The form card of the sign-in and account pages (#237): the surface on the paper, a sand border, larger
     corners than the other cards. Its UAuthForm takes AUTH_FORM_UI (title on the left, in the display font). -->
<template>
  <div class="w-full max-w-md flex flex-col gap-4 rounded-[1.125rem] border border-default bg-default p-5 shadow-sm sm:p-6">
    <slot />
  </div>
</template>
