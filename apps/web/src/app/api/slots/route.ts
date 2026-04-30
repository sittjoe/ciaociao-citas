import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // YYYY-MM
    const year  = searchParams.get('year')

    const now = new Date()
    let start: Date
    let end: Date

    if (month) {
      const [y, m] = month.split('-').map(Number)
      start = new Date(y, m - 1, 1)
      end   = new Date(y, m, 1)
    } else if (year) {
      start = new Date(Number(year), 0, 1)
      end   = new Date(Number(year) + 1, 0, 1)
    } else {
      // Default: next 60 days
      start = now
      end   = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    }

    const snap = await adminDb
      .collection('slots')
      .where('datetime', '>=', Timestamp.fromDate(start))
      .where('datetime', '<', Timestamp.fromDate(end))
      .where('available', '==', true)
      .orderBy('datetime')
      .get()

    const slots = snap.docs.map(doc => {
      const data = doc.data()
      return {
        id:        doc.id,
        datetime:  (data.datetime as Timestamp).toDate().toISOString(),
        available: data.available as boolean,
      }
    })

    return NextResponse.json({ slots })
  } catch (err) {
    console.error('GET /api/slots', err)
    return NextResponse.json({ error: 'Error al obtener horarios' }, { status: 500 })
  }
}
