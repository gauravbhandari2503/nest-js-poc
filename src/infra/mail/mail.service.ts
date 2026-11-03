export interface MailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export abstract class MailService {
  abstract send(message: MailMessage): Promise<void>;
}
