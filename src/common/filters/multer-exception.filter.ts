import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    if (exception.code === 'LIMIT_FILE_SIZE') {
      response.status(400).json({
        statusCode: 400,
        message: 'File exceeds the size limit',
        error: 'Bad Request',
      });
      return;
    }

    response.status(400).json({
      statusCode: 400,
      message: exception.message,
      error: 'Bad Request',
    });
  }
}
