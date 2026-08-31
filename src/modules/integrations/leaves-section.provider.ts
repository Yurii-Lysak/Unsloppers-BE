import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccessResolver } from '../contracts/access-resolver.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { LeavesSectionEntity } from './entities/leaves-section.entity';
import { LeavesSyncService } from './leaves-sync.service';

@Injectable()
@RegisterProvider('section', 'S10')
export class LeavesSectionProvider {
  constructor(
    private readonly leavesSync: LeavesSyncService,
    private readonly accessResolver: AccessResolver,
  ) {}

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
  ): Promise<LeavesSectionEntity> {
    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      subjectEmployeeId,
    );
    if (audience.sections.S10 === 'none') {
      throw new ForbiddenException('S10 is not visible to this viewer');
    }

    const result =
      await this.leavesSync.getLeavesForEmployee(subjectEmployeeId);
    const hideLeaveType = audience.role === 'Colleague';
    const manageLeaveUrl =
      audience.role === 'Self' ? this.leavesSync.getManageLeaveUrl() : null;

    if (result.availability === 'unavailable') {
      return {
        availability: 'unavailable',
        leaves: [],
        manageLeaveUrl,
      };
    }

    return {
      availability: 'ok',
      leaves: result.leaves.map((period) => ({
        type: hideLeaveType ? null : period.type,
        startDate: period.startDate,
        endDate: period.endDate,
        approvalState: hideLeaveType ? null : period.approvalState,
      })),
      manageLeaveUrl,
    };
  }
}
