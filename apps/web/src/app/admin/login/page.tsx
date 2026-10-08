'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Mail } from 'lucide-react'
import { HouseSeal, Wordmark } from '@/components/brand/Wordmark'
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
    <main className="paper-grain flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <HouseSeal size={52} />
          <h1 className="mt-5 text-ink"><Wordmark as="span" className="block text-lg" subtitle="Panel de citas" /></h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="engraved space-y-5 rounded-[1.4rem] p-7">

          <Field label="Correo" required error={errors.email?.message}>
            {(id, ariaProps) => (
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <input
                  id={id}
                  {...ariaProps}
                  {...register('email')}
                  type="email"
                  className="input-clean pl-9"
                  placeholder="tu correo del equipo"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            )}
          </Field>

          <Field label="Contraseña" required error={errors.password?.message}>
            {(id, ariaProps) => (
              <input
                id={id}
                {...ariaProps}
                {...register('password')}
                type="password"
                className="input-clean"
                placeholder="••••••••••••"
                autoComplete="current-password"
              />
            )}
          </Field>

          <Button type="submit" loading={loading} className="w-full">
            Acceder
          </Button>
        </form>
      </div>
    </main>
  )
}
