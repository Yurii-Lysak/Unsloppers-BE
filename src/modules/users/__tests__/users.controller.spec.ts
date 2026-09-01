import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CurrentUserProvider } from '../../contracts/current-user-provider.contract';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';

describe('UsersController', () => {
  let controller: UsersController;

  const user = {
    id: '4f1e6f2e-8bcb-4a9f-b1b6-6c9f2d3a1e00',
    email: 'user@example.com',
    name: 'John Doe',
    countryCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const usersService = {
    create: jest.fn().mockResolvedValue(user),
    findOneForViewer: jest.fn().mockResolvedValue(user),
    update: jest.fn().mockResolvedValue(user),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  const currentUser = {
    getCurrentUser: jest.fn().mockResolvedValue({ userId: user.id }),
  };

  const request = {} as Parameters<UsersController['findOne']>[0];

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: CurrentUserProvider, useValue: currentUser },
      ],
    }).compile();

    controller = module.get(UsersController);
  });

  it('create delegates to the service', async () => {
    const dto = { email: user.email, name: 'John Doe' };

    await expect(controller.create(dto)).resolves.toEqual(user);
    expect(usersService.create).toHaveBeenCalledWith(dto);
  });

  it('findAll is forbidden in bootcamp scope', async () => {
    await expect(controller.findAll(request)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('findOne delegates to the self-scoped service', async () => {
    await expect(controller.findOne(request, user.id)).resolves.toEqual(user);
    expect(usersService.findOneForViewer).toHaveBeenCalledWith(
      user.id,
      user.id,
    );
  });

  it('update delegates to the service', async () => {
    const dto = { name: 'Jane Doe' };

    await expect(controller.update(user.id, dto)).resolves.toEqual(user);
    expect(usersService.update).toHaveBeenCalledWith(user.id, dto);
  });

  it('remove delegates to the service', async () => {
    await expect(controller.remove(user.id)).resolves.toBeUndefined();
    expect(usersService.remove).toHaveBeenCalledWith(user.id);
  });
});
