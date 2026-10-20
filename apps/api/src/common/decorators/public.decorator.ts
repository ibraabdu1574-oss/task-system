import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** مسار بلا مصادقة (الدخول، الصحة). كل ما عداه يتطلب JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
