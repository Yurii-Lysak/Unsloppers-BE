import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import {
  SwaggerCreateUser,
  SwaggerDeleteUser,
  SwaggerFindAllUsers,
  SwaggerFindOneUser,
  SwaggerUpdateUser,
} from './users.swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  @Post()
  @SwaggerCreateUser()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @SwaggerFindAllUsers()
  async findAll(@Req() request: Request) {
    await this.currentUser.getCurrentUser(request);
    throw new ForbiddenException('User directory listing is not available');
  }

  @Get(':id')
  @SwaggerFindOneUser()
  async findOne(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    return this.usersService.findOneForViewer(userId, id);
  }

  @Patch(':id')
  @SwaggerUpdateUser()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SwaggerDeleteUser()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
