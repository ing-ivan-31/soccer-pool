---
description: Scaffold a new NestJS module following the Repository Pattern. Generates module, controller, service, repository, and DTO files, then registers in AppModule. Usage: /new-module <module-name>
allowed-tools: Read, Write, Edit, Bash, Glob
---

# Scaffold NestJS Module: $ARGUMENTS

Create a new NestJS module named `$ARGUMENTS` following the Soccer Pool Repository Pattern.

## Step 1 — Generate base files with NestJS CLI
```bash
cd src/soccer-pool-api
nest g module $ARGUMENTS --no-spec
nest g controller $ARGUMENTS --no-spec
nest g service $ARGUMENTS --no-spec
```

## Step 2 — Create the repository file
Create `src/$ARGUMENTS/$ARGUMENTS.repository.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ${PascalCase}Repository {
  constructor(private readonly prisma: PrismaService) {}

  // Add query methods here — all Prisma calls for this module
}
```

## Step 3 — Create DTO files
Create `src/$ARGUMENTS/dto/create-$ARGUMENTS.dto.ts`:
```typescript
import { IsString } from 'class-validator';

export class Create${PascalCase}Dto {
  @IsString()
  name: string;
}
```

Create `src/$ARGUMENTS/dto/update-$ARGUMENTS.dto.ts`:
```typescript
import { PartialType } from '@nestjs/mapped-types';
import { Create${PascalCase}Dto } from './create-$ARGUMENTS.dto';

export class Update${PascalCase}Dto extends PartialType(Create${PascalCase}Dto) {}
```

## Step 4 — Wire up the module
Update `src/$ARGUMENTS/$ARGUMENTS.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ${PascalCase}Controller } from './$ARGUMENTS.controller';
import { ${PascalCase}Service } from './$ARGUMENTS.service';
import { ${PascalCase}Repository } from './$ARGUMENTS.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [${PascalCase}Controller],
  providers: [${PascalCase}Service, ${PascalCase}Repository],
  exports: [${PascalCase}Service, ${PascalCase}Repository],
})
export class ${PascalCase}Module {}
```

## Step 5 — Inject repository into service
Update `src/$ARGUMENTS/$ARGUMENTS.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ${PascalCase}Repository } from './$ARGUMENTS.repository';

@Injectable()
export class ${PascalCase}Service {
  constructor(private readonly ${camelCase}Repository: ${PascalCase}Repository) {}
}
```

## Step 6 — Register in AppModule
Read `src/app.module.ts` and add `${PascalCase}Module` to the `imports` array.

## Step 7 — Confirm
List all created files and show the final module registered in AppModule.
