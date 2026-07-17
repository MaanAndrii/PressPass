/**
 * Database seed script.
 *
 * Creates the initial administrator account (credentials come from
 * ADMIN_EMAIL / ADMIN_PASSWORD environment variables) and, in non-production
 * environments, a demo journalist with an active card.
 *
 * Usage: npm run db:seed
 */
import { PrismaClient, Role, CardStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { v7 as uuidv7 } from 'uuid';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@presspass.local';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe_Admin1!';

  // Пароль оновлюється і для наявного адміністратора: seed запускається
  // інсталятором, який показує ADMIN_PASSWORD як чинні облікові дані.
  const adminPasswordHash = await argon2.hash(adminPassword);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminPasswordHash, role: Role.ADMIN, emailVerifiedAt: new Date() },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Admin user ready: ${admin.email}`);

  // Каталог посад (укр./англ.) — заповнюємо один раз, якщо таблиця порожня.
  if ((await prisma.position.count()) === 0) {
    await prisma.position.createMany({
      data: [
        { nameUk: 'Кореспондент', nameEn: 'Correspondent' },
        { nameUk: 'Спеціальний кореспондент', nameEn: 'Special correspondent' },
        { nameUk: 'Фотокореспондент', nameEn: 'Photo correspondent' },
        { nameUk: 'Відеооператор', nameEn: 'Cameraperson' },
        { nameUk: 'Репортер', nameEn: 'Reporter' },
        { nameUk: 'Редактор', nameEn: 'Editor' },
        { nameUk: 'Головний редактор', nameEn: 'Editor-in-chief' },
        { nameUk: 'Оглядач', nameEn: 'Columnist' },
        { nameUk: 'Журналіст', nameEn: 'Journalist' },
        { nameUk: 'Ведучий', nameEn: 'Anchor' },
        { nameUk: 'Продюсер', nameEn: 'Producer' },
        { nameUk: 'Блогер', nameEn: 'Blogger' },
      ],
    });
    console.log('Positions catalogue seeded');
  }

  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const demoEmail = 'journalist@presspass.local';
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: {
      email: demoEmail,
      passwordHash: await argon2.hash('ChangeMe_Demo1!'),
      role: Role.JOURNALIST,
      emailVerifiedAt: new Date(),
      journalist: {
        create: {
          fullName: 'Іван Петренко',
          fullNameEn: 'Ivan Petrenko',
        },
      },
    },
  });

  const journalist = await prisma.journalist.findUniqueOrThrow({
    where: { userId: demoUser.id },
  });

  // Демо-редакція (компанія-емітент). Логотип додається адміністратором.
  const editorial =
    (await prisma.editorial.findFirst({ where: { name: 'ТОВ «Приклад Медіа»' } })) ??
    (await prisma.editorial.create({
      data: {
        name: 'ТОВ «Приклад Медіа»',
        displayNameUk: 'Онлайн-медіа «Приклад»',
        displayNameEn: '«Pryklad» Media',
        edrpou: '12345678',
        website: 'https://pryklad.media/registry',
        director: 'Сидоренко Олексій Петрович',
        email: 'office@pryklad.media',
        address: 'м. Київ, вул. Хрещатик, 1',
        phone: '+380441234567',
      },
    }));

  // Демо редакційний адміністратор, прив'язаний до редакції.
  const editorialAdminEmail = 'editor@presspass.local';
  await prisma.user.upsert({
    where: { email: editorialAdminEmail },
    update: { role: Role.EDITORIAL_ADMIN, editorialId: editorial.id, emailVerifiedAt: new Date() },
    create: {
      email: editorialAdminEmail,
      passwordHash: await argon2.hash('ChangeMe_Editor1!'),
      role: Role.EDITORIAL_ADMIN,
      editorialId: editorial.id,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Demo editorial admin ready: ${editorialAdminEmail}`);

  const existingCard = await prisma.card.findFirst({
    where: { journalistId: journalist.id },
  });

  if (!existingCard) {
    const now = new Date();
    const expire = new Date(now);
    expire.setFullYear(expire.getFullYear() + 1);

    const card = await prisma.card.create({
      data: {
        uuid: uuidv7(),
        journalistId: journalist.id,
        editorialId: editorial.id,
        position: 'Кореспондент',
        positionEn: 'Correspondent',
        cardNumber: `PP-${now.getFullYear()}-000001`,
        issueDate: now,
        expireDate: expire,
        status: CardStatus.ACTIVE,
      },
    });
    console.log(`Demo card created: ${card.cardNumber} (${card.uuid})`);
  }

  console.log(`Demo journalist ready: ${demoEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
