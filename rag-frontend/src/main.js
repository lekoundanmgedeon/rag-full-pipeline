import { createApp }    from 'vue'
import { createPinia }  from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App              from './App.vue'
import ChatView         from './views/ChatView.vue'
import { getToken }     from './services/api.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',           component: ChatView },
    { path: '/c/:id',      component: ChatView },
    { path: '/login',      component: () => import('./views/DevLogin.vue') }
  ]
})

router.beforeEach((to, from, next) => {
  const token = getToken()
  const isLoginRoute = to.path === '/login'

  if (!token && !isLoginRoute) {
    return next('/login')
  }

  if (token && isLoginRoute) {
    return next('/')
  }

  next()
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
