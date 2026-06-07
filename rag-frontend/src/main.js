import { createApp }    from 'vue'
import { createPinia }  from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App              from './App.vue'
import ChatView         from './views/ChatView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',           component: ChatView },
    { path: '/c/:id',      component: ChatView },
    { path: '/login', component: () => import('./views/DevLogin.vue') }
  ]
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
