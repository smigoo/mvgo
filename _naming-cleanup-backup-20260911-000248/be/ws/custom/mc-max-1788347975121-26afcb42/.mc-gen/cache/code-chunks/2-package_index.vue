<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <PanelTitle />
    </template>
    <template #header_right>
      <SectionTabsAndIcons 
        v-model:activeTab="activeTab" 
      />
    </template>
    
    <SectionChart 
      :activeTab="activeTab" 
    />
  </base-panel>
</template>