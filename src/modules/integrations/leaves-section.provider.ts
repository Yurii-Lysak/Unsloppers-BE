import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { LeavesSectionEntity } from './entities/leaves-section.entity';
import { LeavesSyncService } from './leaves-sync.service';

@Injectable()
@RegisterProvider('section', 'S10')
export class LeavesSectionProvider extends SectionProvider {
  constructor(
    private readonly leavesSync: LeavesSyncService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience?: ResolvedAudience,
  ): Promise<LeavesSectionEntity> {
    const resolved =
      audience ??
      (await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        subjectEmployeeId,
      ));
    if (resolved.sections.S10 === 'none') {
      throw new ForbiddenException('S10 is not visible to this viewer');
    }

    const result =
      await this.leavesSync.getLeavesForEmployee(subjectEmployeeId);
    const hideLeaveType = resolved.role === 'Colleague';
    const manageLeaveUrl =
      resolved.role === 'Self' ? this.leavesSync.getManageLeaveUrl() : null;

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
