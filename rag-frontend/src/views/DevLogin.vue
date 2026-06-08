<template>
  <div style="padding:2rem">
    <button @click="login">Connexion dev</button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function login() {
  // Token hardcodé pour le dev local uniquement
  localStorage.setItem('rag_token',
   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJ0ZW5hbnRJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInJvbGVzIjpbImFkbWluIl0sImlhdCI6MTc4MDc5OTkzMCwiZXhwIjoxNzgxNDA0NzMwfQ.z5qJxR-GORHCPSJ8_DT1FcR53Kh4O4U7aO6cR08y5JI')
  router.push('/')
}
</script>