'use client'

import type { ReactNode } from 'react'
import type { AppointmentType } from '@/types'

/** Evento que escucha el asistente de reserva para preseleccionar la experiencia. */
export const CHOOSE_EXPERIENCE_EVENT = 'ciaociao:elegir-experiencia'

export function chooseExperience(type: AppointmentType) {
  window.dispatchEvent(new CustomEvent<AppointmentType>(CHOOSE_EXPERIENCE_EVENT, { detail: type }))
}

/**
 * Enlace a #reservar que además le dice al asistente qué experiencia eligió
 * la clienta en la narrativa. Sin JavaScript sigue siendo un ancla normal.
 */
export function ChooseExperienceLink({
  type,
  className,
  children,
}: {
  type: AppointmentType
  className?: string
  children: ReactNode
}) {
  return (
    <a href="#reservar" className={className} onClick={() => chooseExperience(type)}>
      {children}
    </a>
  )
}
