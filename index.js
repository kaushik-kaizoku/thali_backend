const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

const prisma = new PrismaClient()
const app = express();
const port = process.env.PORT || 3000;

const generateTimeSlots = () => {
  const slots = [];
  let hour = 17; 
  let minute = 0;

  while (hour < 22) {
    slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    minute += 30;
    if (minute === 60) {
      minute = 0;
      hour += 1;
    }
  }
  return slots;
};

app.use(express.json());
app.use(cors());

app.get('/api/timeslots', async (req, res) => {
  try{
    const { guests } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tables = await prisma.table.findMany({
      where: {
        capacity: {
          gte: Number(guests)
        }
      }
    })

    if (!tables.length) {
      return res.status(400).json({ message: 'No tables available for this party size' });
    }

    const reservations = await prisma.reservation.findMany({
      where: {
        AND: [
          {
            date: today
          },
          {
            tableId: {
              in: tables.map(table => table.id)
            }
          }
        ]
      }
    });

    const timeSlots = generateTimeSlots();

    const availableSlots = timeSlots.map(time => {
      const [hours, minutes] = time.split(':');
      const slotTime = new Date(today);
      slotTime.setHours(parseInt(hours), parseInt(minutes));

      const conflictingReservation = reservations.find(r => {
        const reservationTime = new Date(r.date);
        return reservationTime.getHours() === parseInt(hours) && 
               reservationTime.getMinutes() === parseInt(minutes);
      });

      return {
        time,
        available: !conflictingReservation
      };
    });

    res.json(availableSlots);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching time slots', error: error.message });
  }
});


app.post('/api/reservations', async (req, res) => {
  try {
    const { name, phone, guests, timeSlot } = req.body;

    if (!name || !phone || !guests || !timeSlot) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const table = await prisma.table.findFirst({
    where: {
      capacity: {
        gte: parseInt(guests)
      }
    }
  });

  if (!table) {
    return res.status(400).json({ message: 'No tables available for this party size' });
  }

  const [hours, minutes] = timeSlot.split(':');
  const reservationDate = new Date();
  reservationDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  const existingReservation = await prisma.reservation.findFirst({
    where: {
      AND: [
        {
          date: reservationDate
        },
        {
          tableId: table.id
        }
      ]
    }
  });

  if (existingReservation) {
    return res.status(400).json({ message: 'Table already reserved for this time slot' });
  }

  const reservation = await prisma.reservation.create({
    data: {
      name,
      phone,
      guests: Number(guests),
      date: reservationDate,
      timeSlot,
      tableId: table.number
    }
  });

  res.status(200).json(reservation);
  }catch (error) {
    res.status(500).json({ message: 'Error creating reservation', error: error.message });
  }
});


const initializeTables = async () => {
  try {
    // Check if any tables already exist
    const existingTables = await prisma.table.findMany();

    if (existingTables.length === 0) {
      // Insert default tables if none exist
      await prisma.table.createMany({
        data: [
          { capacity: 2, number: 'T1' },
          { capacity: 2, number: 'T2' },
          { capacity: 4, number: 'T3' },
          { capacity: 4, number: 'T4' },
          { capacity: 6, number: 'T5' },
          { capacity: 8, number: 'T6' },
        ],
      });

      console.log('Tables initialized');
    }
  } catch (error) {
    console.error('Error initializing tables:', error);
  } finally {
    await prisma.$disconnect();
  }
};

initializeTables();

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});

