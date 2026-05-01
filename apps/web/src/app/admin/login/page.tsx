'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
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
      const res  = await fetch('/api/admin/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
      const json = await res.json() as { error?: string }

      if (!res.ok) {
        if (res.status === 429) {
          toast.error('Demasiados intentos. Espera 15 minutos.')
        } else {
          toast.error(json.error ?? 'Contraseña incorrecta')
        }
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      toast.error('Error de conexión')
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
            <div className="w-12 h-12 rounded-full bg-cream-soft border border-stone-100 flex items-center justify-center">
              <Lock size={20} className="text-champagne" />
            </div>
          </div>

          <Field label="Contraseña" required error={errors.password?.message}>
            <input
              {...register('password')}
              type="password"
              className="input-clean"
              placeholder="••••••••••••"
              autoComplete="current-password"
              autoFocus
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
