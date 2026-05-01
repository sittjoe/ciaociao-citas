'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Mail, KeyRound } from 'lucide-react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { getClientAuth } from '@/lib/firebase-client'
import { adminLoginSchema, type AdminLoginInput } from '@/lib/schemas'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'

export default function AdminLoginPage() {
  const router  = useRouter()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
  })

  const onSubmit = async (data: AdminLoginInput) => {
    setLoading(true)
    try {
      const credential = await signInWithEmailAndPassword(getClientAuth(), data.email, data.password)
      const idToken = await credential.user.getIdToken()

      const res  = await fetch('/api/admin/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ idToken }),
      })
      const json = await res.json() as { error?: string }

      if (!res.ok) {
        if (res.status === 429) {
          toast.error('Demasiados intentos. Espera 15 minutos.')
        } else {
          toast.error(json.error ?? 'No tienes permisos de administrador')
        }
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      toast.error('No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-cream">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl text-ink tracking-widest uppercase">Ciao Ciao</h1>
          <p className="text-xs text-ink-muted tracking-[0.4em] uppercase mt-2 font-semibold">Panel de Administración</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card-soft space-y-5">
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 rounded-full bg-cream-soft border border-ink-line flex items-center justify-center">
              <KeyRound size={20} className="text-champagne" />
            </div>
          </div>

          <Field label="Email" required error={errors.email?.message}>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                {...register('email')}
                type="email"
                className="input-clean pl-9"
                placeholder="admin@ciaociao.mx"
                autoComplete="email"
                autoFocus
              />
            </div>
          </Field>

          <Field label="Contraseña" required error={errors.password?.message}>
            <input
              {...register('password')}
              type="password"
              className="input-clean"
              placeholder="••••••••••••"
              autoComplete="current-password"
            />
          </Field>

          <Button type="submit" loading={loading} className="w-full">
            Acceder
          </Button>
        </form>
      </div>
    </main>
  )
}
