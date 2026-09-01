import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { FieldRegistry } from '../contracts/field-registry.contract';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { SetCustomFieldValueDto } from './dto/set-custom-field-value.dto';
import { CustomFieldDefinitionEntity } from './entities/custom-field-definition.entity';
import { CustomFieldValueEntity } from './entities/custom-field-value.entity';
import { CustomFieldVisibilityService } from './custom-field-visibility.service';
import { FieldRegistryService } from './field-registry.service';
import { MANAGE_CUSTOM_FIELDS_PERMISSION } from './directory.constants';

@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly fieldRegistry: FieldRegistry,
    private readonly fieldRegistryService: FieldRegistryService,
    private readonly visibility: CustomFieldVisibilityService,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async createDefinition(
    viewerId: string,
    dto: CreateCustomFieldDto,
  ): Promise<CustomFieldDefinitionEntity> {
    await this.assertCanManageFields(viewerId);

    const fieldId = await this.fieldRegistry.defineField(
      dto.name,
      dto.type,
      dto.visibility ?? 'management',
      dto.options ?? [],
    );

    return this.fieldRegistryService.getDefinition(fieldId);
  }

  async listDefinitions(
    userId: string,
    viewerEmployeeId: string,
  ): Promise<CustomFieldDefinitionEntity[]> {
    const definitions = await this.fieldRegistryService.listDefinitions();

    if (
      await this.permissionChecker.hasPermission(
        userId,
        MANAGE_CUSTOM_FIELDS_PERMISSION,
      )
    ) {
      return definitions;
    }

    const visible: CustomFieldDefinitionEntity[] = [];
    for (const definition of definitions) {
      if (
        await this.visibility.canViewFieldDefinition(
          viewerEmployeeId,
          definition.visibility,
        )
      ) {
        visible.push(definition);
      }
    }
    return visible;
  }

  async getDefinition(
    userId: string,
    viewerEmployeeId: string,
    fieldId: string,
  ): Promise<CustomFieldDefinitionEntity> {
    const definition = await this.fieldRegistryService.getDefinition(fieldId);

    const canManage = await this.permissionChecker.hasPermission(
      userId,
      MANAGE_CUSTOM_FIELDS_PERMISSION,
    );
    if (canManage) {
      return definition;
    }

    if (
      !(await this.visibility.canViewFieldDefinition(
        viewerEmployeeId,
        definition.visibility,
      ))
    ) {
      throw new ForbiddenException(
        'Custom field is not visible to this viewer',
      );
    }

    return definition;
  }

  async setValue(
    userId: string,
    viewerEmployeeId: string,
    employeeId: string,
    fieldId: string,
    dto: SetCustomFieldValueDto,
  ): Promise<CustomFieldValueEntity> {
    const definition = await this.fieldRegistryService.getDefinition(fieldId);

    const canManage = await this.permissionChecker.hasPermission(
      userId,
      MANAGE_CUSTOM_FIELDS_PERMISSION,
    );
    const canWrite =
      canManage ||
      (await this.visibility.canWriteFieldForSubject(
        viewerEmployeeId,
        employeeId,
        definition.visibility,
      ));
    if (!canWrite) {
      throw new ForbiddenException(
        'Cannot write custom field value for this employee',
      );
    }

    if (!('value' in dto) || dto.value === undefined) {
      throw new BadRequestException('value is required');
    }

    await this.fieldRegistry.setValue(employeeId, fieldId, dto.value);

    const stored = await this.fieldRegistry.query({
      employeeIds: [employeeId],
      fieldIds: [fieldId],
    });

    return {
      employeeId,
      fieldId,
      value: stored[0]?.value ?? null,
    };
  }

  async listValuesForEmployee(
    userId: string,
    viewerEmployeeId: string,
    employeeId: string,
  ): Promise<CustomFieldValueEntity[]> {
    await this.fieldRegistryService.assertEmployeeExists(employeeId);

    const canManage = await this.permissionChecker.hasPermission(
      userId,
      MANAGE_CUSTOM_FIELDS_PERMISSION,
    );
    const allDefinitions = await this.fieldRegistryService.listDefinitions();

    const visibleDefinitions: CustomFieldDefinitionEntity[] = [];
    for (const definition of allDefinitions) {
      if (
        canManage ||
        (await this.visibility.canViewFieldForSubject(
          viewerEmployeeId,
          employeeId,
          definition.visibility,
        ))
      ) {
        visibleDefinitions.push(definition);
      }
    }

    if (visibleDefinitions.length === 0) {
      return [];
    }

    return this.fieldRegistry.query({
      employeeIds: [employeeId],
      fieldIds: visibleDefinitions.map((definition) => definition.id),
    });
  }

  private async assertCanManageFields(viewerId: string): Promise<void> {
    const allowed = await this.permissionChecker.hasPermission(
      viewerId,
      MANAGE_CUSTOM_FIELDS_PERMISSION,
    );
    if (!allowed) {
      throw new ForbiddenException('Missing manage custom fields permission');
    }
  }
}
