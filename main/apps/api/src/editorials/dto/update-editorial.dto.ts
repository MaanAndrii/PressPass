import { PartialType } from '@nestjs/swagger';

import { CreateEditorialDto } from './create-editorial.dto';

/** All editorial fields are optional on update. */
export class UpdateEditorialDto extends PartialType(CreateEditorialDto) {}
